import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import webPush from "web-push";
import { isNotificationDestination, isTrustedPushEndpoint } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function validWebhookSecret(value: string | null) {
  const expected = process.env.PUSH_WEBHOOK_SECRET;
  if (!expected || expected.length < 32 || !value) return false;
  const received = Buffer.from(value);
  const saved = Buffer.from(expected);
  return received.length === saved.length && timingSafeEqual(received, saved);
}

export async function POST(request: NextRequest) {
  if (!validWebhookSecret(request.headers.get("x-bie-push-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject?.startsWith("mailto:")) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  }

  try {
    const raw = await request.text();
    if (raw.length > 12000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    const payload = JSON.parse(raw);
    const id = payload?.record?.id;
    if (payload?.type !== "INSERT" || payload?.table !== "notifications" || payload?.schema !== "public" ||
        typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: notice, error: noticeError } = await admin.from("notifications")
      .select("id, recipient_id, href").eq("id", id).maybeSingle();
    if (noticeError) throw noticeError;
    if (!notice) return NextResponse.json({ sent: 0 });
    const { data: recipient, error: profileError } = await admin.from("profiles")
      .select("id, role, status").eq("id", notice.recipient_id).maybeSingle();
    if (profileError) throw profileError;
    if (!recipient || recipient.status !== "active") return NextResponse.json({ sent: 0 });

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("staff_push_subscriptions")
      .select("id, endpoint, p256dh, auth_key, authorized_device_session_id")
      .eq("user_id", recipient.id).limit(5);
    if (subscriptionsError) throw subscriptionsError;
    const sessionIds = (subscriptions ?? [])
      .map((row) => row.authorized_device_session_id)
      .filter((sessionId): sessionId is string => typeof sessionId === "string");
    const activeSessions = new Set<string>();
    if (recipient.role === "employee" && sessionIds.length) {
      const { data: sessions, error: sessionError } = await admin.from("authorized_device_sessions")
        .select("id, authorized_devices!inner(status, employee_id)")
        .in("id", sessionIds).eq("employee_id", recipient.id)
        .is("revoked_at", null).gt("expires_at", new Date().toISOString());
      if (sessionError) throw sessionError;
      for (const session of sessions ?? []) {
        const device = Array.isArray(session.authorized_devices)
          ? session.authorized_devices[0] : session.authorized_devices;
        if (device?.status === "active" && device.employee_id === recipient.id) activeSessions.add(session.id);
      }
    }

    webPush.setVapidDetails(subject, publicKey, privateKey);
    const message = JSON.stringify({
      id: notice.id,
      href: isNotificationDestination(notice.href) ? notice.href : "/"
    });
    const attempts = await Promise.all((subscriptions ?? []).map(async (subscription) => {
      if (recipient.role === "employee" &&
          (typeof subscription.authorized_device_session_id !== "string" ||
           !activeSessions.has(subscription.authorized_device_session_id))) return "skipped";
      if (!isTrustedPushEndpoint(subscription.endpoint)) return "skipped";
      try {
        await webPush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key }
        }, message, { TTL: 3600, timeout: 5000 });
        return "sent";
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("staff_push_subscriptions").delete().eq("id", subscription.id);
          return "stale";
        } else {
          console.error("Push delivery failed", { status });
          return "failed";
        }
      }
    }));
    return NextResponse.json({
      sent: attempts.filter((result) => result === "sent").length,
      failed: attempts.filter((result) => result === "failed").length
    });
  } catch (error) {
    console.error("Push webhook failed", error);
    return NextResponse.json({ error: "Push delivery failed" }, { status: 500 });
  }
}
