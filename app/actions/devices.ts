"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

function redirectDeviceStatus(type: "success" | "error", message: string) {
  redirect(`/admin/employees?employee_${type}=${encodeURIComponent(message)}`);
}

function deviceActionErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("authorized_devices") && message.includes("schema cache")) {
    return "Authorized devices table is missing. Run migration in Supabase.";
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
    throw new Error("Authorized devices can be managed only for employee accounts.");
  }

  return employee;
}

export async function approveDeviceRequest(formData: FormData) {
  let type: "success" | "error" = "success";
  let message = "Device registration request approved successfully.";

  try {
    const currentProfile = await requireAdminProfile();
    requireAdminManager(currentProfile.role);

    const requestId = String(formData.get("request_id") || "");
    if (!requestId) throw new Error("Request ID is required.");

    const admin = createAdminClient();

    const { data: request, error: fetchError } = await admin
      .from("device_registration_requests")
      .select("employee_id, status")
      .eq("id", requestId)
      .single();

    if (fetchError || !request) {
      throw new Error("Request not found.");
    }

    if (request.status !== "pending") {
      throw new Error("Request is no longer pending.");
    }

    const employee = await getTargetEmployee(request.employee_id);

    const { error: rpcError } = await admin.rpc("approve_device_request", {
      p_request_id: requestId,
      p_actor_id: currentProfile.id
    });

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    revalidatePath("/admin/employees");
    revalidatePath(`/admin/employees/${employee.id}`);
  } catch (error) {
    type = "error";
    message = deviceActionErrorMessage(error, "Device could not be approved.");
  }

  redirectDeviceStatus(type, message);
}

export async function rejectDeviceRequest(formData: FormData) {
  let type: "success" | "error" = "success";
  let message = "Device registration request rejected.";

  try {
    const currentProfile = await requireAdminProfile();
    requireAdminManager(currentProfile.role);

    const requestId = String(formData.get("request_id") || "");
    if (!requestId) throw new Error("Request ID is required.");

    const admin = createAdminClient();

    const { error: rpcError } = await admin.rpc("reject_device_request", {
      p_request_id: requestId,
      p_actor_id: currentProfile.id
    });

    if (rpcError) throw new Error(rpcError.message);

    revalidatePath("/admin/employees");
  } catch (error) {
    type = "error";
    message = deviceActionErrorMessage(error, "Request could not be rejected.");
  }

  redirectDeviceStatus(type, message);
}

export async function resetAuthorizedDevice(formData: FormData) {
  let type: "success" | "error" = "success";
  let message = "Authorized device was reset for this employee.";

  try {
    const currentProfile = await requireAdminProfile();
    requireAdminManager(currentProfile.role);
    const employee = await getTargetEmployee(String(formData.get("employee_id") || ""));
    const admin = createAdminClient();

    const { error: rpcError } = await admin.rpc("reset_authorized_device", {
      p_employee_id: employee.id,
      p_actor_id: currentProfile.id
    });

    if (rpcError) throw new Error(rpcError.message);

    revalidatePath("/admin/employees");
    revalidatePath(`/admin/employees/${employee.id}`);
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

    const { error: rpcError } = await admin.rpc("disable_authorized_device", {
      p_employee_id: employee.id,
      p_actor_id: currentProfile.id
    });

    if (rpcError) throw new Error(rpcError.message);

    revalidatePath("/admin/employees");
    revalidatePath(`/admin/employees/${employee.id}`);
  } catch (error) {
    type = "error";
    message = deviceActionErrorMessage(error, "Device could not be disabled.");
  }

  redirectDeviceStatus(type, message);
}

export async function logoutDeviceSession() {
  const admin = createAdminClient();
  const info = await import("@/lib/authorized-devices").then(m => m.currentDeviceRequestInfo());
  if (info.deviceToken) {
    const hash = await import("@/lib/authorized-devices").then(m => m.hashDeviceToken(info.deviceToken as string));
    const { data: revoked, error: revokeError } = await admin.rpc("revoke_device_session", {
      p_token_hash: hash
    });

    if (revokeError) {
      throw new Error("Failed to revoke device session: " + revokeError.message);
    }
    await import("@/lib/authorized-devices").then(m => m.clearDeviceCookie());
  }
}
