import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExpectedOriginAndRPID, createDeviceToken, createDeviceTokenHash, setDeviceCookie, isMobileUserAgent } from "@/lib/authorized-devices";

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

    const body = await request.json();
    const { response } = body;

    if (!response) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: allowed, error: rateLimitError } = await admin.rpc("check_webauthn_rate_limit", {
      p_employee_id: user.id,
      p_action: "authenticate_verify",
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

    const { data: device } = await admin
      .from("authorized_devices")
      .select("id, credential_id, credential_public_key, credential_counter, status, verification_version")
      .eq("employee_id", user.id)
      .eq("status", "active")
      .not("credential_id", "is", null)
      .maybeSingle();

    if (!device) {
      return NextResponse.json({ error: "No active WebAuthn device found." }, { status: 400 });
    }

    // Get challenge
    const { data: challenges } = await admin
      .from("device_webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("employee_id", user.id)
      .eq("purpose", "authentication")
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const activeChallenge = challenges?.[0];

    if (!activeChallenge || new Date(activeChallenge.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Challenge expired or not found" }, { status: 400 });
    }

    // Mark challenge used atomically
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
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: activeChallenge.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        credential: {
          id: device.credential_id as string,
          publicKey: new Uint8Array(Buffer.from(device.credential_public_key as string, "base64")),
          counter: Number(device.credential_counter)
        },
        requireUserVerification: true
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const { verified, authenticationInfo } = verification;

    if (!verified || !authenticationInfo) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    if (authenticationInfo.credentialDeviceType === "multiDevice" || authenticationInfo.credentialBackedUp === true) {
      return NextResponse.json({ error: "Cannot authenticate with a synced or multi-device credential. Must be platform-bound." }, { status: 400 });
    }

    // Update credential counter atomically and ensure status is STILL active and no concurrent verification happened
    // We check verification_version specifically to prevent concurrent replays of different challenges when counter=0
    const newVerificationVersion = crypto.randomUUID();
    const { data: updatedDevice, error: updateError } = await admin
      .from("authorized_devices")
      .update({
        credential_counter: authenticationInfo.newCounter,
        verification_version: newVerificationVersion,
        last_verified_at: new Date().toISOString()
      })
      .eq("id", device.id)
      .eq("status", "active")
      .eq("credential_counter", device.credential_counter)
      .eq("verification_version", device.verification_version)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedDevice) {
      return NextResponse.json({ error: "Device is no longer active or a concurrent verification occurred." }, { status: 400 });
    }

    // Create session
    const sessionToken = createDeviceToken();
    const sessionTokenHash = createDeviceTokenHash(sessionToken);

    // 30 days expiry for session
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip");
    const userAgent = request.headers.get("user-agent");

    const { error: sessionError } = await admin.rpc("create_authorized_device_session", {
      p_device_id: device.id,
      p_employee_id: user.id,
      p_token_hash: sessionTokenHash,
      p_expires_at: expiresAt.toISOString(),
      p_ip: ip,
      p_ua: userAgent
    });

    if (sessionError) {
      console.error(sessionError);
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    await setDeviceCookie(sessionToken, expiresAt.getTime());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
