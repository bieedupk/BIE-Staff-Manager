"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/app/actions/audit";
import {
  currentDeviceRequestInfo,
  unauthorizedDeviceMessage,
  verifyEmployeeDeviceAccess
} from "@/lib/authorized-devices";
import { requireAdminManagerProfile, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

function attendanceRedirectPath(formData: FormData) {
  const sourcePath = String(formData.get("source_path") || "");
  return sourcePath === "/employee/attendance" ? "/employee/attendance" : "/employee/dashboard";
}

function redirectWithAttendanceMessage(path: string, type: "success" | "error", message: string) {
  redirect(`${path}?attendance_${type}=${encodeURIComponent(message)}`);
}

function adminAttendancePath(formData: FormData, statusOverride?: string) {
  const params = new URLSearchParams();

  for (const key of ["date", "employee"]) {
    const value = String(formData.get(key) || "");
    if (value) params.set(key, value);
  }

  const statusFilter = statusOverride ?? String(formData.get("status_filter") || "");
  if (statusFilter) params.set("status", statusFilter);

  return params.size ? `/admin/attendance?${params.toString()}` : "/admin/attendance";
}

function redirectWithAttendanceCorrectionMessage(path: string, type: "success" | "error", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}attendance_correction_${type}=${encodeURIComponent(message)}`);
}

function attendanceActionErrorMessage(error: unknown, action: "check_in" | "check_out") {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("Attendance already exists")) {
    return "Attendance is already checked in for today.";
  }

  if (message.includes("Please check in before checking out")) {
    return "Please check in before checking out.";
  }

  if (message.includes("Attendance already checked out")) {
    return "Attendance is already completed for today.";
  }

  if (message.includes("Could not find the function public.check_in_today")) {
    return "Attendance setup is incomplete. Please run migration 004_attendance_rpc_signature_fix.sql in Supabase.";
  }

  if (message.includes("Could not find the function public.check_out_today")) {
    return "Attendance setup is incomplete. Please run migration 004_attendance_rpc_signature_fix.sql in Supabase.";
  }

  if (message) return message;

  return action === "check_in" ? "Check In could not be completed." : "Check Out could not be completed.";
}

function revalidateAttendancePages() {
  revalidatePath("/employee/dashboard");
  revalidatePath("/employee/attendance");
  revalidatePath("/admin/attendance");
}

async function logUnauthorizedAttendance(profile: Profile, reason: string | undefined, message: string | undefined) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      actor_id: profile.id,
      action: "attendance_blocked_unauthorized_device",
      entity_type: "attendance",
      entity_id: null,
      details: {
        employee_id: profile.id,
        reason: reason ?? "unauthorized",
        message: message ?? unauthorizedDeviceMessage
      }
    });
  } catch {
    // Attendance must remain blocked even if audit logging is temporarily unavailable.
  }
}

async function requireAuthorizedAttendanceDevice(profile: Profile) {
  const deviceAccess = await verifyEmployeeDeviceAccess(profile, await currentDeviceRequestInfo(), {
    logMobileBlocked: true
  });

  if (!deviceAccess.allowed) {
    await logUnauthorizedAttendance(profile, deviceAccess.code, deviceAccess.message);
    throw new Error(deviceAccess.message ?? unauthorizedDeviceMessage);
  }
}

export async function checkIn(formData: FormData) {
  const returnPath = attendanceRedirectPath(formData);
  const profile = await requireProfile();
  let type: "success" | "error" = "success";
  let message = "Attendance checked in successfully.";

  try {
    await requireAuthorizedAttendanceDevice(profile);
    const supabase = await createClient();

    const { error } = await supabase.rpc("check_in_today");

    if (error) throw new Error(error.message);

    await logAudit("attendance check in", "attendance", null, { employee_id: profile.id });
  } catch (error) {
    type = "error";
    message = attendanceActionErrorMessage(error, "check_in");
  }

  revalidateAttendancePages();
  redirectWithAttendanceMessage(returnPath, type, message);
}

export async function checkOut(formData: FormData) {
  const returnPath = attendanceRedirectPath(formData);
  const profile = await requireProfile();
  let type: "success" | "error" = "success";
  let message = "Attendance checked out successfully.";

  try {
    await requireAuthorizedAttendanceDevice(profile);
    const supabase = await createClient();

    const { error } = await supabase.rpc("check_out_today");

    if (error) throw new Error(error.message);

    await logAudit("attendance check out", "attendance", null, { employee_id: profile.id });
  } catch (error) {
    type = "error";
    message = attendanceActionErrorMessage(error, "check_out");
  }

  revalidateAttendancePages();
  redirectWithAttendanceMessage(returnPath, type, message);
}

export async function correctAttendance(formData: FormData) {
  await requireAdminManagerProfile();
  const returnPath = adminAttendancePath(formData);
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const totalHoursValue = String(formData.get("total_hours") || "");
  const correctionReason = String(formData.get("correction_reason") || "").trim();

  if (!correctionReason) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Correction reason is required.");
  }

  const { error } = await supabase
    .from("attendance")
    .update({
      status: String(formData.get("status") || "Present"),
      total_hours: totalHoursValue ? Number(totalHoursValue) : null
    })
    .eq("id", id);

  if (error) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance correction could not be saved.");
  }

  await logAudit("attendance_corrected", "attendance", id, {
    status: formData.get("status"),
    total_hours: totalHoursValue || null,
    correction_reason: correctionReason
  });
  revalidatePath("/admin/attendance");
  redirectWithAttendanceCorrectionMessage(adminAttendancePath(formData, "All"), "success", "Attendance correction saved.");
}
