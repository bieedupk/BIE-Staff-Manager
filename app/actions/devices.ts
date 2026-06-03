"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth";
import {
  createDeviceToken,
  createDeviceTokenHash,
  currentDeviceRequestInfo,
  setDeviceCookie
} from "@/lib/authorized-devices";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

function redirectDeviceStatus(type: "success" | "error", message: string) {
  redirect(`/admin/employees?employee_${type}=${encodeURIComponent(message)}`);
}

function deviceActionErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("authorized_devices") && message.includes("schema cache")) {
    return "Authorized devices table is missing. Run supabase/migrations/003_authorized_devices.sql in Supabase.";
  }

  return message || fallback;
}

function requireAdminManager(role: string) {
  if (role !== "super_admin" && role !== "admin") {
    throw new Error("Only admin and super admin can manage authorized devices.");
  }
}

async function getTargetEmployee(employeeId: string) {
  const admin = createAdminClient();
  const { data: employee, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", employeeId)
    .single<Profile>();

  if (error || !employee) {
    throw new Error("Employee profile was not found.");
  }

  if (employee.role !== "employee") {
    throw new Error("Authorized devices can be registered only for employee accounts.");
  }

  return employee;
}

async function registerCurrentDevice(employeeId: string, auditAction: "device_registered" | "device_reset") {
  const currentProfile = await requireAdminProfile();
  requireAdminManager(currentProfile.role);

  const employee = await getTargetEmployee(employeeId);
  const requestInfo = await currentDeviceRequestInfo();
  const token = createDeviceToken();
  const admin = createAdminClient();

  const { error: disableOldDevicesError } = await admin
    .from("authorized_devices")
    .update({ status: "disabled" })
    .eq("employee_id", employee.id)
    .eq("status", "active");

  if (disableOldDevicesError) {
    throw new Error(disableOldDevicesError.message);
  }

  const { data: device, error } = await admin
    .from("authorized_devices")
    .insert({
      employee_id: employee.id,
      device_name: `${employee.full_name} office computer`,
      device_token_hash: createDeviceTokenHash(token),
      status: "active",
      registered_by: currentProfile.id,
      last_used_at: new Date().toISOString(),
      last_ip: requestInfo.ip,
      last_user_agent: requestInfo.userAgent
    })
    .select("id")
    .single();

  if (error || !device) {
    throw new Error(error?.message || "Could not register authorized device.");
  }

  await setDeviceCookie(token);

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: currentProfile.id,
    action: auditAction,
    entity_type: "authorized_devices",
    entity_id: device.id,
    details: {
      employee_id: employee.id,
      employee_email: employee.email
    }
  });

  if (auditError) {
    throw new Error(auditError.message);
  }

  revalidatePath("/admin/employees");
}

export async function registerAuthorizedDevice(formData: FormData) {
  let type: "success" | "error" = "success";
  let message = "This office computer is now authorized for this employee.";

  try {
    await registerCurrentDevice(String(formData.get("employee_id") || ""), "device_registered");
  } catch (error) {
    type = "error";
    message = deviceActionErrorMessage(error, "Device could not be registered.");
  }

  redirectDeviceStatus(type, message);
}

export async function resetAuthorizedDevice(formData: FormData) {
  let type: "success" | "error" = "success";
  let message = "Authorized device was reset for this employee.";

  try {
    await registerCurrentDevice(String(formData.get("employee_id") || ""), "device_reset");
  } catch (error) {
    type = "error";
    message = deviceActionErrorMessage(error, "Device could not be reset.");
  }

  redirectDeviceStatus(type, message);
}

export async function disableAuthorizedDevice(formData: FormData) {
  let type: "success" | "error" = "success";
  let message = "Authorized device was disabled for this employee.";

  try {
    const currentProfile = await requireAdminProfile();
    requireAdminManager(currentProfile.role);
    const employee = await getTargetEmployee(String(formData.get("employee_id") || ""));
    const admin = createAdminClient();

    const { data: activeDevices, error } = await admin
      .from("authorized_devices")
      .update({ status: "disabled" })
      .eq("employee_id", employee.id)
      .eq("status", "active")
      .select("id");

    if (error) throw new Error(error.message);

    await admin.from("audit_logs").insert({
      actor_id: currentProfile.id,
      action: "device_disabled",
      entity_type: "authorized_devices",
      entity_id: activeDevices?.[0]?.id ?? null,
      details: {
        employee_id: employee.id,
        employee_email: employee.email,
        disabled_devices: activeDevices?.length ?? 0
      }
    });

    revalidatePath("/admin/employees");
  } catch (error) {
    type = "error";
    message = deviceActionErrorMessage(error, "Device could not be disabled.");
  }

  redirectDeviceStatus(type, message);
}
