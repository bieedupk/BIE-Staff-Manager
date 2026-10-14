import { NextResponse, type NextRequest } from "next/server";
import {
  deviceCookieName, deviceRequestInfoFromRequest, hashDeviceToken, verifyEmployeeDeviceAccess
} from "@/lib/authorized-devices";
import { getProfileByUserId } from "@/lib/auth";
import { isTrustedPushEndpoint } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

async function currentSubscriber(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { status: 401 as const };
  const profile = await getProfileByUserId(user.id);
  if (!profile) return { status: 403 as const };
  if (profile.role !== "employee") return { userId: user.id, sessionId: null };

  const access = await verifyEmployeeDeviceAccess(profile, deviceRequestInfoFromRequest(request));
  if (!access.allowed) return { status: 403 as const };
  // An employee subscription belongs to the active WebAuthn browser session.
  const token = request.cookies.get(deviceCookieName)?.value;
  if (!token) return { status: 403 as const };
  const admin = createAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("authorized_device_sessions")
    .select("id, authorized_devices!inner(status, employee_id)")
    .eq("session_token_hash", hashDeviceToken(token))
    .eq("employee_id", user.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError || !session) return { status: 403 as const };
  const device = Array.isArray(session.authorized_devices)
    ? session.authorized_devices[0] : session.authorized_devices;
  if (device?.status !== "active" || device?.employee_id !== user.id) return { status: 403 as const };
  return { userId: user.id, sessionId: session.id };
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const subscriber = await currentSubscriber(request);
    if ("status" in subscriber) return NextResponse.json({ error: "Unauthorized" }, { status: subscriber.status });
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "Invalid subscription" }, { status: 413 });
    const input = JSON.parse(raw);
    const endpoint = input?.endpoint;
    const p256dh = input?.keys?.p256dh;
    const authKey = input?.keys?.auth;
    if (typeof endpoint !== "string" || endpoint.length > 2048 || !isTrustedPushEndpoint(endpoint) ||
        typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{20,256}$/.test(p256dh) ||
        typeof authKey !== "string" || !/^[A-Za-z0-9_-]{10,256}$/.test(authKey)) {
      return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing, error: lookupError } = await admin.from("staff_push_subscriptions")
      .select("id, user_id").eq("endpoint", endpoint).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing && existing.user_id !== subscriber.userId) {
      return NextResponse.json({ error: "This browser is linked to another account. Disable its alerts first." }, { status: 409 });
    }
    const values = {
      user_id: subscriber.userId,
      authorized_device_session_id: subscriber.sessionId,
      p256dh,
      auth_key: authKey,
      updated_at: new Date().toISOString()
    };
    if (existing) {
      const { error } = await admin.from("staff_push_subscriptions").update(values)
        .eq("id", existing.id).eq("user_id", subscriber.userId);
      if (error) throw error;
    } else {
      const { count, error: countError } = await admin.from("staff_push_subscriptions")
        .select("id", { count: "exact", head: true }).eq("user_id", subscriber.userId);
      if (countError) throw countError;
      if ((count ?? 0) >= 5) return NextResponse.json({ error: "At most five browsers can receive alerts." }, { status: 409 });
      const { error } = await admin.from("staff_push_subscriptions").insert({ ...values, endpoint });
      if (error) throw error;
    }
    return NextResponse.json({ enabled: true });
  } catch (error) {
    console.error("Push subscription failed", error);
    return NextResponse.json({ error: "Could not enable alerts" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: "Invalid subscription" }, { status: 413 });
    const { endpoint } = JSON.parse(raw);
    if (typeof endpoint !== "string" || !isTrustedPushEndpoint(endpoint)) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    const admin = createAdminClient();
    const { error } = await admin.from("staff_push_subscriptions").delete()
      .eq("user_id", user.id).eq("endpoint", endpoint);
    if (error) throw error;
    return NextResponse.json({ enabled: false });
  } catch (error) {
    console.error("Push unsubscribe failed", error);
    return NextResponse.json({ error: "Could not disable alerts" }, { status: 500 });
  }
}
