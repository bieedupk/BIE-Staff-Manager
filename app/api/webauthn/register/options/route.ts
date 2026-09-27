import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExpectedOriginAndRPID, isMobileUserAgent } from "@/lib/authorized-devices";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isMobileUserAgent(request.headers.get("user-agent") || "")) {
      return NextResponse.json({ error: "Mobile devices cannot be registered." }, { status: 403 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role, status")
      .eq("id", user.id)
      .single();

    if (!profile || profile.status !== "active" || profile.role !== "employee") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: allowed, error: rateLimitError } = await admin.rpc("check_webauthn_rate_limit", {
      p_employee_id: user.id,
      p_action: "register_options",
      p_max_requests: 5,
      p_window_seconds: 900
    });

    if (rateLimitError) {
      console.error(rateLimitError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const { error: expireError } = await admin.from("device_registration_requests")
      .update({ status: "expired" })
      .eq("employee_id", user.id)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    if (expireError) {
      console.error(expireError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    const { count: pendingCount } = await admin
      .from("device_registration_requests")
      .select("*", { count: "exact", head: true })
      .eq("employee_id", user.id)
      .eq("status", "pending");

    if (pendingCount && pendingCount > 0) {
      return NextResponse.json({ error: "You already have a pending registration request." }, { status: 400 });
    }

    // Rate limit check: limit active challenges per user (if needed, but deleting old ones is sufficient)
    await admin.from("device_webauthn_challenges").delete().eq("employee_id", user.id).eq("purpose", "registration");

    const { rpID } = getExpectedOriginAndRPID();

    const options = await generateRegistrationOptions({
      rpName: "BIE Staff Manager",
      rpID,
      userID: new Uint8Array(Buffer.from(user.id)),
      userName: profile.full_name,
      attestationType: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred"
      }
    });

    // Save challenge
    const { error: insertError } = await admin.from("device_webauthn_challenges").insert({
      employee_id: user.id,
      purpose: "registration",
      challenge: options.challenge,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
    });

    if (insertError) {
      console.error(insertError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    return NextResponse.json(options);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
