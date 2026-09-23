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
import { getOrganizationSettings } from "@/lib/organization-settings";
import type { Profile } from "@/lib/types";
import { getHalfDayThresholdHours, getOrgCurrentTimeMinutes, isDutyEndedForDate, parseTimeToMinutes, todayISOInTimezone } from "@/lib/utils";

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

function redirectWithAttendanceCorrectionMessage(path: string, type: "success" | "error", message: string): never {
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

  if (message.includes("Approved leave exists for today")) {
    return "Check-in is unavailable because you have approved Leave for today.";
  }

  if (message) return message;

  return action === "check_in" ? "Check In could not be completed." : "Check Out could not be completed.";
}

function revalidateAttendancePages() {
  revalidatePath("/employee/dashboard");
  revalidatePath("/employee/attendance");
  revalidatePath("/admin/attendance");
}

function nullableFormString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function nullableFormNumber(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? Number(value) : null;
}

function isValidISODate(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  const date = new Date(`${dateString}T00:00:00Z`);
  return !isNaN(date.getTime()) && date.toISOString().startsWith(dateString);
}

function addDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildTimestampFromDateAndTime(date: string, time: string | null, timezone: string) {
  const trimmedDate = String(date || "").trim();
  const trimmedTime = String(time || "").trim();

  if (!trimmedDate || !trimmedTime) {
    return null;
  }

  const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmedDate);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmedTime);

  if (!dateMatch || !timeMatch) {
    throw new Error("Correction date or time is invalid.");
  }

  const offset = timezoneOffsetString(trimmedDate, timezone);
  return `${trimmedDate}T${trimmedTime}:00${offset}`;
}

function timezoneOffsetString(dateValue: string, timezone: string) {
  const date = new Date(`${dateValue}T12:00:00Z`);

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "longOffset"
    }).formatToParts(date);

    const zone = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    return zone.replace("GMT", "") || "+00:00";
  } catch {
    return "+00:00";
  }
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

    await logAudit("attendance check in", "attendance", null, { employee_id: profile.id }, { actorId: profile.id });
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

    // Re-evaluate Half Day status based on organization-configured duty schedule
    const settings = await getOrganizationSettings();
    const halfDayThreshold = getHalfDayThresholdHours(settings);
    const orgToday = todayISOInTimezone(settings.timezone);

    const { data: updatedRecord } = await supabase
      .from("attendance")
      .select("id, total_hours, status")
      .eq("employee_id", profile.id)
      .eq("work_date", orgToday)
      .maybeSingle();

    if (updatedRecord && updatedRecord.total_hours !== null) {
      const workedHours = Number(updatedRecord.total_hours);
      if (workedHours <= halfDayThreshold && updatedRecord.status !== "Half Day") {
        await supabase
          .from("attendance")
          .update({ status: "Half Day" })
          .eq("id", updatedRecord.id);
      }
    }

    await logAudit("attendance check out", "attendance", null, { employee_id: profile.id }, { actorId: profile.id });
  } catch (error) {
    type = "error";
    message = attendanceActionErrorMessage(error, "check_out");
  }

  revalidateAttendancePages();
  redirectWithAttendanceMessage(returnPath, type, message);
}

export async function correctAttendance(formData: FormData) {
  const currentProfile = await requireAdminManagerProfile();
  const returnPath = adminAttendancePath(formData);
  const supabase = createAdminClient();
  const settings = await getOrganizationSettings();
  const id = String(formData.get("id") || "");
  const correctionDate = String(formData.get("correction_date") || "").trim();

  const rawCheckIn = nullableFormString(formData, "check_in_time");
  const rawCheckOut = nullableFormString(formData, "check_out_time");

  let checkInTime = rawCheckIn;
  let checkOutTime = rawCheckOut;

  if (rawCheckIn === "00:00" && rawCheckOut === "00:00") {
    checkInTime = null;
    checkOutTime = null;
  }

  const correctionReason = String(formData.get("correction_reason") || "").trim();
  const outcome = String(formData.get("attendance_outcome") || "Worked");

  if (!["Worked", "Absent", "Leave"].includes(outcome)) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Invalid attendance outcome selected.");
  }

  if (!correctionReason) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Correction reason is required.");
  }

  if (!correctionDate) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Correction date is required.");
  }

  if (!isValidISODate(correctionDate)) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Correction date is invalid.");
  }

  if (!id) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance record id is required.");
  }

  const isMissingCheckIn = !checkInTime;
  const isMissingCheckOut = !checkOutTime;
  const orgTodayISO = todayISOInTimezone(settings.timezone);

  if (outcome === "Worked") {
    if (isMissingCheckIn) {
      redirectWithAttendanceCorrectionMessage(returnPath, "error", "Check-in time is required for Worked attendance.");
    }
    if (isMissingCheckOut && correctionDate < orgTodayISO) {
      redirectWithAttendanceCorrectionMessage(returnPath, "error", "Check-out time is required for past Worked attendance.");
    }
  } else {
    // Absent or Leave: both times nullified
    checkInTime = null;
    checkOutTime = null;
  }

  // ── Business rule validation ─────────────────────────────────────────────────

  // 1. Future date check
  if (correctionDate > orgTodayISO) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance cannot be recorded for a future date.");
  }

  // 2. Check-in validation
  if (checkInTime) {
    const dutyStartMinutes = parseTimeToMinutes(settings.office_start_time);
    const checkInMinutes = parseTimeToMinutes(checkInTime);
    if (dutyStartMinutes !== null && checkInMinutes !== null && checkInMinutes < dutyStartMinutes) {
      redirectWithAttendanceCorrectionMessage(
        returnPath,
        "error",
        "Check-in time cannot be earlier than the configured duty start time."
      );
    }
  }

  const isOvernight = Boolean(checkInTime && checkOutTime && checkOutTime < checkInTime);
  const checkOutDate = isOvernight ? addDaysISO(correctionDate, 1) : correctionDate;

  // Ensure timestamps are not in the future compared to absolute current time
  let checkInAt = checkInTime ? buildTimestampFromDateAndTime(correctionDate, checkInTime, settings.timezone) : null;
  let checkOutAt = checkOutTime ? buildTimestampFromDateAndTime(checkOutDate, checkOutTime, settings.timezone) : null;

  const now = new Date();
  if (checkInAt && new Date(checkInAt) > now) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Check-in time cannot be in the future.");
  }
  if (checkOutAt && new Date(checkOutAt) > now) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Check-out time cannot be in the future.");
  }

  // ── End business rule validation ─────────────────────────────────────────────

  const isSynthetic = id.startsWith("synthetic-");
  let employeeId = String(formData.get("employee_id") || "").trim();

  if (!isSynthetic) {
    const { data: existing, error: fetchError } = await supabase
      .from("attendance")
      .select("employee_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !existing) {
      redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance record does not exist.");
    }
    employeeId = existing.employee_id;
  } else if (!employeeId) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Employee id is required for synthetic record correction.");
  }

  if (isSynthetic && !isDutyEndedForDate(correctionDate, settings)) {
    redirectWithAttendanceCorrectionMessage(
      returnPath,
      "error",
      "Attendance correction for a missing record is available after duty hours end."
    );
  }

  // Calculate final total hours
  let finalTotalHours: number | null = null;
  if (outcome === "Worked" && checkInAt && checkOutAt) {
    const ms = new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
    if (ms <= 0) {
      redirectWithAttendanceCorrectionMessage(returnPath, "error", "Elapsed duration must be positive.");
    }
    finalTotalHours = Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
  }

  // Determine canonical status
  let finalStatus = "Present";
  if (outcome === "Absent") finalStatus = "Absent";
  else if (outcome === "Leave") finalStatus = "Leave";
  else {
    const checkInMinutes = checkInTime ? parseTimeToMinutes(checkInTime) : null;
    const lateThresholdMinutes = parseTimeToMinutes(settings.late_threshold_time);
    const halfDayThreshold = getHalfDayThresholdHours(settings);

    if (finalTotalHours !== null && finalTotalHours <= halfDayThreshold) {
      finalStatus = "Half Day";
    } else if (checkInMinutes !== null && lateThresholdMinutes !== null && checkInMinutes > lateThresholdMinutes) {
      finalStatus = "Late";
    }
  }

  const { data: atomicResult, error: atomicError } = await supabase.rpc("correct_attendance_atomic", {
    p_id: isSynthetic ? null : id,
    p_employee_id: employeeId,
    p_work_date: correctionDate,
    p_check_in_at: checkInAt,
    p_check_out_at: checkOutAt,
    p_status: finalStatus,
    p_total_hours: finalTotalHours,
    p_correction_reason: correctionReason,
    p_actor_id: currentProfile.id,
    p_is_synthetic: isSynthetic
  });

  if (atomicError) {
    let msg = atomicError.message || "Attendance correction could not be saved.";
    if (msg.includes("Approved leave exists")) msg = "This date is covered by Approved Leave. Attendance correction is not available.";
    else if (msg.includes("Target date already contains attendance") || msg.includes("Attendance record already exists")) msg = "Target date already contains an attendance record.";
    else if (msg.includes("Correction limit reached")) msg = "Attendance correction limit has been reached.";

    redirectWithAttendanceCorrectionMessage(returnPath, "error", msg);
  }

  revalidatePath("/admin/attendance");
  revalidatePath("/admin/dashboard");
  revalidatePath("/employee/dashboard");
  revalidatePath("/employee/attendance");
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}/attendance`);
  revalidatePath(`/admin/employees/${employeeId}/reports`);

  redirectWithAttendanceCorrectionMessage(adminAttendancePath(formData, "All"), "success", "Attendance correction saved.");
}
