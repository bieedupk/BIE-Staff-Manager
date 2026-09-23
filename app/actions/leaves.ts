"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/app/actions/audit";
import { requireAdminProfile, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminManagerRole } from "@/lib/utils";

function isValidUUID(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function isValidDate(dateString: string) {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function subtractDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() - days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function deleteSafeLegacyLeavePlaceholders(
  adminClient: ReturnType<typeof createAdminClient>,
  employeeId: string,
  fromDate: string,
  toDate: string
) {
  if (fromDate > toDate) return;
  const { error } = await adminClient
    .from("attendance")
    .delete()
    .eq("employee_id", employeeId)
    .gte("work_date", fromDate)
    .lte("work_date", toDate)
    .eq("status", "Leave")
    .is("check_in_at", null)
    .is("check_out_at", null)
    .eq("correction_count", 0)
    .or("total_hours.is.null,total_hours.eq.0");

  if (error) {
    throw new Error(`Failed to clean up legacy leave placeholders: ${error.message}`);
  }
}

export async function applyLeave(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: profile.id,
    leave_type: String(formData.get("leave_type") || ""),
    from_date: String(formData.get("from_date") || ""),
    to_date: String(formData.get("to_date") || ""),
    reason: String(formData.get("reason") || "").trim(),
    status: "Pending"
  });

  if (error) throw new Error(error.message);
  await logAudit("leave requested", "leave_requests", null, undefined, { actorId: profile.id });
  revalidatePath("/employee/leave");
  revalidatePath("/admin/leaves");
}

export async function reviewLeave(formData: FormData) {
  const profile = await requireAdminProfile();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));

  if (!isValidUUID(id)) throw new Error("Invalid leave request ID.");
  if (status !== "Approved" && status !== "Rejected") {
    throw new Error("Invalid leave review status.");
  }

  const { data: leaveRequest } = await supabase.from("leave_requests").select("employee_id, from_date, to_date, status").eq("id", id).maybeSingle();

  if (!isAdminManagerRole(profile.role)) {
    if (!leaveRequest) {
      throw new Error("Supervisors can review leave only for employees assigned to them.");
    }
  }

  if (!leaveRequest) {
    throw new Error("Leave request not found.");
  }

  if (leaveRequest.status !== "Pending") {
    throw new Error("This leave request has already been reviewed.");
  }

  if (status === "Approved") {
    const adminClient = createAdminClient();
    const { data: overlappingAttendance, error: conflictError } = await adminClient
      .from("attendance")
      .select("id, check_in_at, check_out_at, total_hours, correction_count")
      .eq("employee_id", leaveRequest.employee_id)
      .gte("work_date", leaveRequest.from_date)
      .lte("work_date", leaveRequest.to_date);

    if (conflictError) {
      throw new Error("Attendance could not be verified for this leave request.");
    }

    const hasConflict = overlappingAttendance?.some(
      (a) => a.check_in_at !== null || a.check_out_at !== null || (a.total_hours !== null && Number(a.total_hours) > 0) || a.correction_count > 0
    );

    if (hasConflict) {
      throw new Error("Leave cannot be approved because protected attendance exists for one or more selected dates.");
    }
  }

  const { data: updatedRequest, error } = await supabase
    .from("leave_requests")
    .update({
      status,
      admin_comment: String(formData.get("admin_comment") || "").trim() || null,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("status", "Pending")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!updatedRequest) {
    throw new Error("This leave request has already been reviewed.");
  }

  await logAudit(`leave ${status.toLowerCase()}`, "leave_requests", id, { status }, { actorId: profile.id });
  revalidatePath("/admin/leaves");
  revalidatePath("/employee/leave");
  revalidatePath("/admin/attendance");
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/dashboard");
  revalidatePath("/admin/dashboard");
  revalidatePath(`/admin/employees/${leaveRequest.employee_id}`);
}

export async function updateLeaveDates(formData: FormData) {
  const profile = await requireAdminProfile();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const fromDate = String(formData.get("from_date") || "").trim();
  const toDate = String(formData.get("to_date") || "").trim();

  if (!isValidUUID(id)) throw new Error("Invalid leave request ID.");
  if (!isValidDate(fromDate) || !isValidDate(toDate)) throw new Error("Invalid dates provided.");
  if (toDate < fromDate) throw new Error("End date cannot be before start date.");

  const { data: leaveRequest } = await supabase.from("leave_requests").select("*").eq("id", id).maybeSingle();

  if (!isAdminManagerRole(profile.role)) {
    if (!leaveRequest) {
      throw new Error("Supervisors can review leave only for employees assigned to them.");
    }
  }

  if (!leaveRequest) throw new Error("Leave request not found.");
  if (leaveRequest.status === "Rejected" || leaveRequest.status === "Cancelled") {
    throw new Error("Cannot edit rejected or cancelled leave.");
  }

  if (leaveRequest.status === "Approved") {
    const adminClient = createAdminClient();
    const { data: overlappingAttendance, error: conflictError } = await adminClient
      .from("attendance")
      .select("id, check_in_at, check_out_at, total_hours, correction_count, work_date, status")
      .eq("employee_id", leaveRequest.employee_id)
      .gte("work_date", fromDate)
      .lte("work_date", toDate);

    if (conflictError) throw new Error("Attendance could not be verified for this leave request.");

    const hasConflict = overlappingAttendance?.some((a) => {
      const isNewlyCovered = a.work_date < leaveRequest.from_date || a.work_date > leaveRequest.to_date;
      if (!isNewlyCovered) return false;

      const isSafePlaceholder = a.status === "Leave" && a.check_in_at === null && a.check_out_at === null && (!a.total_hours || Number(a.total_hours) === 0) && a.correction_count === 0;
      if (isSafePlaceholder) return false;

      if (a.check_in_at !== null || a.check_out_at !== null || (a.total_hours !== null && Number(a.total_hours) > 0) || a.correction_count > 0) {
        return true;
      }
      return false;
    });

    if (hasConflict) {
      throw new Error("Leave dates cannot be updated because protected attendance exists on newly covered dates.");
    }
  }

  const { data: updatedRequest, error } = await supabase
    .from("leave_requests")
    .update({ from_date: fromDate, to_date: toDate })
    .eq("id", id)
    .eq("status", leaveRequest.status)
    .eq("from_date", leaveRequest.from_date)
    .eq("to_date", leaveRequest.to_date)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!updatedRequest) throw new Error("Leave request was modified concurrently. Please refresh.");

  if (leaveRequest.status === "Approved") {
    const adminClient = createAdminClient();

    if (leaveRequest.from_date < fromDate) {
      const cleanToDate = fromDate > leaveRequest.to_date ? leaveRequest.to_date : subtractDaysISO(fromDate, 1);
      await deleteSafeLegacyLeavePlaceholders(adminClient, leaveRequest.employee_id, leaveRequest.from_date, cleanToDate);
    }

    if (leaveRequest.to_date > toDate) {
      const cleanFromDate = toDate < leaveRequest.from_date ? leaveRequest.from_date : subtractDaysISO(toDate, -1);
      await deleteSafeLegacyLeavePlaceholders(adminClient, leaveRequest.employee_id, cleanFromDate, leaveRequest.to_date);
    }
  }

  await logAudit("leave_dates_updated", "leave_requests", id, {
    old_from_date: leaveRequest.from_date,
    old_to_date: leaveRequest.to_date,
    new_from_date: fromDate,
    new_to_date: toDate
  }, { actorId: profile.id });

  revalidatePath("/admin/leaves");
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/dashboard");
  revalidatePath("/employee/leave");
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/dashboard");
  revalidatePath(`/admin/employees/${leaveRequest.employee_id}`);
}

export async function endLeaveNow(formData: FormData) {
  const profile = await requireAdminProfile();
  const supabase = await createClient();
  const id = String(formData.get("id"));

  if (!isValidUUID(id)) throw new Error("Invalid leave request ID.");

  const { data: leaveRequest } = await supabase.from("leave_requests").select("*").eq("id", id).maybeSingle();
  if (!isAdminManagerRole(profile.role)) {
    if (!leaveRequest) throw new Error("Supervisors can review leave only for employees assigned to them.");
  }
  if (!leaveRequest) throw new Error("Leave request not found.");
  if (leaveRequest.status !== "Approved") throw new Error("Only approved leave can be ended early.");

  const { getOrganizationSettings } = await import("@/lib/organization-settings");
  const { todayISOInTimezone } = await import("@/lib/utils");

  const settings = await getOrganizationSettings();
  const today = todayISOInTimezone(settings.timezone);

  if (today > leaveRequest.to_date) {
    throw new Error("Leave has already naturally ended.");
  }

  let newStatus = leaveRequest.status;
  let newToDate = leaveRequest.to_date;

  if (today <= leaveRequest.from_date) {
    newStatus = "Cancelled";
  } else {
    newToDate = subtractDaysISO(today, 1);
  }

  const { data: updatedRequest, error } = await supabase
    .from("leave_requests")
    .update({ status: newStatus, to_date: newToDate })
    .eq("id", id)
    .eq("status", leaveRequest.status)
    .eq("from_date", leaveRequest.from_date)
    .eq("to_date", leaveRequest.to_date)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!updatedRequest) throw new Error("Leave request was modified concurrently.");

  const adminClient = createAdminClient();

  if (newStatus === "Cancelled") {
    await deleteSafeLegacyLeavePlaceholders(adminClient, leaveRequest.employee_id, leaveRequest.from_date, leaveRequest.to_date);
  } else {
    const cleanFromDate = subtractDaysISO(newToDate, -1);
    await deleteSafeLegacyLeavePlaceholders(adminClient, leaveRequest.employee_id, cleanFromDate, leaveRequest.to_date);
  }

  await logAudit("leave_ended", "leave_requests", id, {
    old_status: leaveRequest.status,
    old_to_date: leaveRequest.to_date,
    new_status: newStatus,
    new_to_date: newToDate
  }, { actorId: profile.id });

  revalidatePath("/admin/leaves");
  revalidatePath("/admin/attendance");
  revalidatePath("/admin/dashboard");
  revalidatePath("/employee/leave");
  revalidatePath("/employee/attendance");
  revalidatePath("/employee/dashboard");
  revalidatePath(`/admin/employees/${leaveRequest.employee_id}`);
}
