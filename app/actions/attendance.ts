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
  const checkInTime = nullableFormString(formData, "check_in_time");
  const checkOutTime = nullableFormString(formData, "check_out_time");
  const totalHours = nullableFormNumber(formData, "total_hours");
  const correctionReason = String(formData.get("correction_reason") || "").trim();

  if (!correctionReason) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Correction reason is required.");
  }

  if (!correctionDate) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Correction date is required.");
  }

  if (!id) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance record id is required.");
  }

  // ── Business rule validation ─────────────────────────────────────────────────

  // 1. Future date check: correctionDate must not be later than today in org timezone
  const orgTodayISO = todayISOInTimezone(settings.timezone);

  if (correctionDate > orgTodayISO) {
    redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance cannot be recorded for a future date.");
  }

  // 2. Check-in must not be earlier than configured duty start time (applies to today and past dates)
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

  // 3. If correction date is today: check-out must not be later than current org-local time
  if (checkOutTime && correctionDate === orgTodayISO) {
    const currentOrgMinutes = getOrgCurrentTimeMinutes(settings.timezone);
    const checkOutMinutes = parseTimeToMinutes(checkOutTime);

    // On today, an overnight checkout (which advances to tomorrow) is in the future.
    // Also, same-day checkout cannot exceed current time.
    if (isOvernight || (checkOutMinutes !== null && checkOutMinutes > currentOrgMinutes)) {
      redirectWithAttendanceCorrectionMessage(returnPath, "error", "Check-out time cannot be later than the current time.");
    }
  }

  // ── End business rule validation ─────────────────────────────────────────────

  const isSyntheticAbsent = id.startsWith("synthetic-absent-");
  const status = String(formData.get("status") || "Present");

  const checkInAt = buildTimestampFromDateAndTime(correctionDate, checkInTime, settings.timezone);
  const checkOutAt = buildTimestampFromDateAndTime(checkOutDate, checkOutTime, settings.timezone);

  if (isSyntheticAbsent) {
    // Handle synthetic absent row correction
    const employeeId = String(formData.get("employee_id") || "").trim();
    if (!employeeId) {
      redirectWithAttendanceCorrectionMessage(returnPath, "error", "Employee id is required for synthetic absent correction.");
    }

    // Check if attendance already exists for this employee_id and correction_date
    const { data: existingByDate, error: checkError } = await supabase
      .from("attendance")
      .select("id, work_date, check_in_at, check_out_at, status, total_hours")
      .eq("employee_id", employeeId)
      .eq("work_date", correctionDate)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      redirectWithAttendanceCorrectionMessage(returnPath, "error", "Could not check existing attendance records.");
    }

    if (existingByDate) {
      // Update existing attendance record
      const updates: Record<string, unknown> = {
        check_in_at: checkInAt,
        check_out_at: checkOutAt,
        status,
        total_hours: totalHours,
        updated_at: new Date().toISOString()
      };

      const { data: updatedAttendance, error } = await supabase
        .from("attendance")
        .update(updates)
        .eq("id", existingByDate.id)
        .select("id")
        .maybeSingle();

      if (error || !updatedAttendance) {
        redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance correction could not be saved.");
      }

      const auditDetails: Record<string, unknown> = {
        old_check_in_at: existingByDate.check_in_at,
        old_check_out_at: existingByDate.check_out_at,
        old_status: existingByDate.status,
        old_total_hours: existingByDate.total_hours,
        old_work_date: existingByDate.work_date,
        new_check_in_at: checkInAt,
        new_check_out_at: checkOutAt,
        new_status: status,
        new_total_hours: totalHours,
        new_work_date: correctionDate,
        correction_reason: correctionReason
      };

      await logAudit("attendance_corrected", "attendance", existingByDate.id, auditDetails, { actorId: currentProfile.id });
    } else {
      if (!isDutyEndedForDate(correctionDate, settings)) {
        redirectWithAttendanceCorrectionMessage(
          returnPath,
          "error",
          "Attendance correction for a missing record is available after duty hours end."
        );
      }

      // Insert new attendance record from synthetic absent correction
      const { data: insertedAttendance, error: insertError } = await supabase
        .from("attendance")
        .insert({
          employee_id: employeeId,
          work_date: correctionDate,
          check_in_at: checkInAt,
          check_out_at: checkOutAt,
          status,
          total_hours: totalHours,
          updated_at: new Date().toISOString()
        })
        .select("id")
        .maybeSingle();

      if (insertError || !insertedAttendance) {
        redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance correction could not be saved.");
      }

      const auditDetails: Record<string, unknown> = {
        old_check_in_at: null,
        old_check_out_at: null,
        old_status: "Absent",
        old_total_hours: null,
        old_work_date: correctionDate,
        new_check_in_at: checkInAt,
        new_check_out_at: checkOutAt,
        new_status: status,
        new_total_hours: totalHours,
        new_work_date: correctionDate,
        correction_reason: correctionReason,
        created_from_synthetic_absent: true
      };

      await logAudit("attendance_corrected", "attendance", insertedAttendance.id, auditDetails, { actorId: currentProfile.id });
    }
  } else {
    // Handle real attendance record correction (existing logic)
    const { data: existingAttendance, error: fetchError } = await supabase
      .from("attendance")
      .select("id, work_date, check_in_at, check_out_at, status, total_hours")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !existingAttendance) {
      redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance record does not exist.");
    }

    const updates: Record<string, unknown> = {
      check_in_at: checkInAt,
      check_out_at: checkOutAt,
      status,
      total_hours: totalHours,
      updated_at: new Date().toISOString()
    };

    if (correctionDate && existingAttendance.work_date && existingAttendance.work_date !== correctionDate) {
      updates.work_date = correctionDate;
    }

    const { data: updatedAttendance, error } = await supabase
      .from("attendance")
      .update(updates)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error || !updatedAttendance) {
      redirectWithAttendanceCorrectionMessage(returnPath, "error", "Attendance correction could not be saved.");
    }

    const auditDetails: Record<string, unknown> = {
      old_check_in_at: existingAttendance.check_in_at,
      old_check_out_at: existingAttendance.check_out_at,
      old_status: existingAttendance.status,
      old_total_hours: existingAttendance.total_hours,
      new_check_in_at: checkInAt,
      new_check_out_at: checkOutAt,
      new_status: status,
      new_total_hours: totalHours,
      correction_reason: correctionReason
    };

    if (existingAttendance.work_date && correctionDate && existingAttendance.work_date !== correctionDate) {
      auditDetails.old_work_date = existingAttendance.work_date;
      auditDetails.new_work_date = correctionDate;
    }

    await logAudit("attendance_corrected", "attendance", id, auditDetails, { actorId: currentProfile.id });
  }

  revalidatePath("/admin/attendance");
  redirectWithAttendanceCorrectionMessage(adminAttendancePath(formData, "All"), "success", "Attendance correction saved.");
}
