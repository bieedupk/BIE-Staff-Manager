import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExpectedOriginAndRPID, isMobileUserAgent } from "@/lib/authorized-devices";
import { randomBytes } from "node:crypto";

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

    const body = await request.json();
    const { response, deviceName } = body;

    if (!response || typeof deviceName !== "string" || !deviceName.trim() || deviceName.length > 100) {
      return NextResponse.json({ error: "Bad Request: Invalid device name" }, { status: 400 });
    }

    // Get challenge
    const admin = createAdminClient();

    const { data: allowed, error: rateLimitError } = await admin.rpc("check_webauthn_rate_limit", {
      p_employee_id: user.id,
      p_action: "register_verify",
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
    const { data: challenges } = await admin
      .from("device_webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("employee_id", user.id)
      .eq("purpose", "registration")
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const activeChallenge = challenges?.[0];

    if (!activeChallenge || new Date(activeChallenge.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Challenge expired or not found" }, { status: 400 });
    }

    // Mark challenge as used atomically
    const { data: updatedChallenge } = await admin
      .from("device_webauthn_challenges")
      .update({ used_at: new Date().toISOString() })
      .eq("id", activeChallenge.id)
      .is("used_at", null)
      .select("id")
      .single();

    if (!updatedChallenge) {
      return NextResponse.json({ error: "Challenge already used" }, { status: 400 });
    }

    const { expectedOrigin, rpID } = getExpectedOriginAndRPID();

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: activeChallenge.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: true
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const { verified, registrationInfo } = verification;

    if (!verified || !registrationInfo) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;

    // Strict requirements
    if (credentialDeviceType === "multiDevice" || credentialBackedUp === true) {
      return NextResponse.json({ error: "Cannot register synced or multi-device credentials. Must be a platform-bound authenticator (like Windows Hello)." }, { status: 400 });
    }

    // Generate short code
    const registrationCode = randomBytes(3).toString("hex").toUpperCase(); // 6 chars

    // Transition any organically expired requests to 'expired' so they don't block registration
    const { error: expireError } = await admin.from("device_registration_requests")
      .update({ status: "expired" })
      .eq("employee_id", user.id)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    if (expireError) {
      console.error(expireError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    // Check for active requests limit
    const { count } = await admin.from("device_registration_requests").select("id", { count: "exact", head: true }).eq("employee_id", user.id).eq("status", "pending");
    if ((count ?? 0) >= 1) {
      return NextResponse.json({ error: "You already have a pending registration request. Please ask administration to review it." }, { status: 400 });
    }

    // Buffer to base64
    const pubKeyBase64 = Buffer.from(credential.publicKey).toString("base64");

    const { error: insertError } = await admin.rpc("create_device_registration_request", {
      p_employee_id: user.id,
      p_code: registrationCode,
      p_cred_id: credential.id,
      p_cred_pub_key: pubKeyBase64,
      p_cred_counter: credential.counter,
      p_transports: credential.transports || [],
      p_dev_type: credentialDeviceType,
      p_backed_up: credentialBackedUp,
      p_dev_name: deviceName.substring(0, 50),
      p_ip: request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip"),
      p_ua: request.headers.get("user-agent"),
      p_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    if (insertError) {
      console.error(insertError);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, code: registrationCode });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
