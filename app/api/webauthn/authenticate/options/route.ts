import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
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
      return NextResponse.json({ error: "Mobile devices cannot authenticate." }, { status: 403 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role, status")
      .eq("id", user.id)
      .single();

    if (!profile || profile.status !== "active" || profile.role !== "employee") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Must have an active v2 device
    const { data: device } = await supabase
      .from("authorized_devices")
      .select("credential_id")
      .eq("employee_id", user.id)
      .eq("status", "active")
      .not("credential_id", "is", null)
      .maybeSingle();

    if (!device) {
      return NextResponse.json({ error: "No active WebAuthn device found." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: allowed, error: rateLimitError } = await admin.rpc("check_webauthn_rate_limit", {
      p_employee_id: user.id,
      p_action: "authenticate_options",
      p_max_requests: 10,
      p_window_seconds: 900
    });

    if (rateLimitError) {
      console.error(rateLimitError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }
    await admin.from("device_webauthn_challenges").delete().eq("employee_id", user.id).eq("purpose", "authentication");

    const { rpID } = getExpectedOriginAndRPID();

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [{
        id: device.credential_id as string,
        transports: ["internal"] // we required platform attachment
      }],
      userVerification: "required"
    });

    const { error: insertError } = await admin.from("device_webauthn_challenges").insert({
      employee_id: user.id,
      purpose: "authentication",
      challenge: options.challenge,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
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
