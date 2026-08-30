import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

export const deviceCookieName = "bie_staff_device_token";
export const employeeMobileAccessMessage = "Employee access is allowed only from an authorized office computer.";
export const unauthorizedDeviceMessage = "This device is not authorized. Please contact administration.";

type DeviceRequestInfo = {
  deviceToken: string | null;
  ip: string | null;
  userAgent: string;
};

type DeviceAccessResult = {
  allowed: boolean;
  code?: "mobile" | "missing_token" | "unauthorized";
  message?: string;
};

function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createDeviceToken() {
  return randomBytes(32).toString("base64url");
}

export function createDeviceTokenHash(token: string) {
  return hashDeviceToken(token);
}

export function isMobileUserAgent(userAgent: string) {
  return /Android|iPhone|iPad|iPod|IEMobile|Windows Phone|BlackBerry|Opera Mini|Mobile/i.test(userAgent);
}

function requestIpFromHeaders(headerStore: Headers) {
  const forwardedFor = headerStore.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;

  return headerStore.get("x-real-ip");
}

export async function currentDeviceRequestInfo(): Promise<DeviceRequestInfo> {
  const headerStore = await headers();
  const cookieStore = await cookies();

  return {
    deviceToken: cookieStore.get(deviceCookieName)?.value ?? null,
    ip: requestIpFromHeaders(headerStore),
    userAgent: headerStore.get("user-agent") ?? ""
  };
}

export function deviceRequestInfoFromRequest(request: NextRequest): DeviceRequestInfo {
  return {
    deviceToken: request.cookies.get(deviceCookieName)?.value ?? null,
    ip: requestIpFromHeaders(request.headers),
    userAgent: request.headers.get("user-agent") ?? ""
  };
}

async function writeDeviceAudit(action: string, profile: Profile, details: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action,
      entity_type: "profiles",
      entity_id: profile.id,
      details
    });
  } catch {
    // Device blocking must still work if audit logging is temporarily unavailable.
  }
}

export async function verifyEmployeeDeviceAccess(
  profile: Profile,
  requestInfo: DeviceRequestInfo,
  options: { logMobileBlocked?: boolean } = {}
): Promise<DeviceAccessResult> {
  if (profile.role !== "employee") {
    return { allowed: true };
  }

  if (isMobileUserAgent(requestInfo.userAgent)) {
    if (options.logMobileBlocked) {
      await writeDeviceAudit("employee_mobile_access_blocked", profile, {
        user_agent: requestInfo.userAgent,
        ip: requestInfo.ip
      });
    }

    return {
      allowed: false,
      code: "mobile",
      message: employeeMobileAccessMessage
    };
  }

  if (!requestInfo.deviceToken) {
    return {
      allowed: false,
      code: "missing_token",
      message: unauthorizedDeviceMessage
    };
  }

  const admin = createAdminClient();
  const { data: device } = await admin
    .from("authorized_devices")
    .select("id, last_used_at")
    .eq("employee_id", profile.id)
    .eq("device_token_hash", hashDeviceToken(requestInfo.deviceToken))
    .eq("status", "active")
    .maybeSingle<{ id: string; last_used_at: string | null }>();

  if (!device) {
    return {
      allowed: false,
      code: "unauthorized",
      message: unauthorizedDeviceMessage
    };
  }

  const DEVICE_LAST_USED_THROTTLE_MS = 5 * 60 * 1000;
  const now = Date.now();
  const lastUsedTime = device.last_used_at ? new Date(device.last_used_at).getTime() : 0;
  const shouldUpdateLastUsed = !device.last_used_at || Number.isNaN(lastUsedTime) || now - lastUsedTime > DEVICE_LAST_USED_THROTTLE_MS;

  if (shouldUpdateLastUsed) {
    await admin
      .from("authorized_devices")
      .update({
        last_used_at: new Date().toISOString(),
        last_ip: requestInfo.ip,
        last_user_agent: requestInfo.userAgent
      })
      .eq("id", device.id);
  }

  return { allowed: true };
}

export async function setDeviceCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: deviceCookieName,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
}
