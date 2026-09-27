import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import { getServerSupabaseEnv } from "@/lib/env";

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
  code?: "mobile" | "missing_token" | "unauthorized" | "expired";
  message?: string;
  isLegacy?: boolean;
};

export function getExpectedOriginAndRPID() {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    const url = process.env.APP_BASE_URL;
    if (!url || url !== "https://bie-staff-manager.vercel.app") {
      throw new Error("APP_BASE_URL must be exactly https://bie-staff-manager.vercel.app in production for WebAuthn.");
    }
    const parsed = new URL(url);
    return {
      expectedOrigin: parsed.origin,
      rpID: parsed.hostname
    };
  } else {
    const url = process.env.APP_BASE_URL || "http://localhost:3000";
    const parsed = new URL(url);
    if (!["http://localhost:3000", "http://localhost:3001"].includes(parsed.origin)) {
      throw new Error("Local development APP_BASE_URL must be an allowed localhost origin.");
    }
    return {
      expectedOrigin: parsed.origin,
      rpID: "localhost"
    };
  }
}

export function hashDeviceToken(token: string) {
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

  const tokenHash = hashDeviceToken(requestInfo.deviceToken);
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("authorized_device_sessions")
    .select("id, last_used_at, expires_at, authorized_device_id, authorized_devices!inner(status, employee_id)")
    .eq("session_token_hash", tokenHash)
    .eq("employee_id", profile.id)
    .is("revoked_at", null)
    .maybeSingle();

  const now = Date.now();
  const DEVICE_LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

  if (session) {
    const parentDevice = Array.isArray(session.authorized_devices)
      ? session.authorized_devices[0]
      : session.authorized_devices;

    if (parentDevice?.status === "active" && parentDevice?.employee_id === profile.id) {
      if (new Date(session.expires_at).getTime() < now) {
        return {
          allowed: false,
          code: "expired",
          message: "Your browser session has expired. Please verify your computer again."
        };
      }

      const lastUsedTime = session.last_used_at ? new Date(session.last_used_at).getTime() : 0;
      const shouldUpdateLastUsed = !session.last_used_at || Number.isNaN(lastUsedTime) || now - lastUsedTime > DEVICE_LAST_USED_THROTTLE_MS;

      if (shouldUpdateLastUsed) {
        await admin
          .from("authorized_device_sessions")
          .update({
            last_used_at: new Date().toISOString(),
            last_ip: requestInfo.ip,
            last_user_agent: requestInfo.userAgent
          })
          .eq("id", session.id);
      }

      return { allowed: true, isLegacy: false };
    }
  }

  const { data: legacyDevice } = await admin
    .from("authorized_devices")
    .select("id, last_used_at")
    .eq("employee_id", profile.id)
    .eq("device_token_hash", tokenHash)
    .eq("status", "active")
    .maybeSingle();

  if (!legacyDevice) {
    return {
      allowed: false,
      code: "unauthorized",
      message: unauthorizedDeviceMessage
    };
  }

  const legacyLastUsedTime = legacyDevice.last_used_at ? new Date(legacyDevice.last_used_at).getTime() : 0;
  const legacyShouldUpdateLastUsed = !legacyDevice.last_used_at || Number.isNaN(legacyLastUsedTime) || now - legacyLastUsedTime > DEVICE_LAST_USED_THROTTLE_MS;

  if (legacyShouldUpdateLastUsed) {
    await admin
      .from("authorized_devices")
      .update({
        last_used_at: new Date().toISOString(),
        last_ip: requestInfo.ip,
        last_user_agent: requestInfo.userAgent
      })
      .eq("id", legacyDevice.id);
  }

  return { allowed: true, isLegacy: true };
}

export async function setDeviceCookie(token: string, expiresAtMs: number) {
  const cookieStore = await cookies();
  const maxAge = Math.floor((expiresAtMs - Date.now()) / 1000);
  cookieStore.set({
    name: deviceCookieName,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAge > 0 ? maxAge : 0
  });
}

export async function clearDeviceCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: deviceCookieName,
    value: "",
    path: "/",
    maxAge: 0
  });
}
