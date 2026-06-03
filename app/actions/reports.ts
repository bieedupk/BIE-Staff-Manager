"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/app/actions/audit";
import { requireAdminProfile, requireEmployeeProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceRecord, DailyReportReviewStatus } from "@/lib/types";
import { isAdminManagerRole } from "@/lib/utils";

function redirectWithDailyReportMessage(type: "success" | "error", message: string) {
  redirect(`/employee/daily-report?daily_report_${type}=${encodeURIComponent(message)}`);
}

function dailyReportsAdminPath(formData: FormData, statusOverride?: string) {
  const params = new URLSearchParams();

  for (const key of ["date", "employee", "department"]) {
    const value = String(formData.get(key) || "");
    if (value) params.set(key, value);
  }

  const status = statusOverride ?? String(formData.get("status") || "");
  if (status) params.set("status", status);

  return params.size ? `/admin/daily-reports?${params.toString()}` : "/admin/daily-reports";
}

function redirectWithDailyReportReviewMessage(path: string, type: "success" | "error", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}daily_report_review_${type}=${encodeURIComponent(message)}`);
}

function redirectWithDailyReportResetMessage(path: string, type: "success" | "error", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}daily_report_reset_${type}=${encodeURIComponent(message)}`);
}

function dailyReportSubmitErrorMessage(error: { code?: string; message?: string }) {
  if (error.code === "23505") {
    return "A daily report has already been submitted for this date.";
  }

  if (error.message?.includes("row-level security")) {
    return "Daily Report permissions need to be updated before this report can be submitted.";
  }

  return "Daily Report could not be submitted. Please try again.";
}

function dailyReportAttendanceErrorMessage(attendance: AttendanceRecord | null) {
  if (!attendance) {
    return "Attendance record not found for this date.";
  }

  if (!attendance.check_out_at) {
    return "Please check out before submitting daily report.";
  }

  if (attendance.total_hours === null) {
    return "Attendance hours are not available for this date.";
  }

  return null;
}

function dailyReportReviewErrorMessage(error: { message?: string }) {
  if (error.message?.includes("Daily report review is locked")) {
    return "This report has already been reviewed and cannot be changed.";
  }

  return "Daily Report review could not be saved.";
}

type ReviewableDailyReport = {
  employee_id: string;
  review_status: DailyReportReviewStatus | null;
  review_rating: number | null;
  reviewed_at: string | null;
};

function isDailyReportReviewLocked(report: ReviewableDailyReport) {
  return report.review_status === "reviewed" || report.reviewed_at !== null || report.review_rating !== null;
}

function canDailyReportBeReviewed(report: ReviewableDailyReport) {
  return (report.review_status === "pending_review" || report.review_status === null) && !isDailyReportReviewLocked(report);
}

function revalidateDailyReportPages() {
  revalidatePath("/employee/daily-report");
  revalidatePath("/admin/daily-reports");
  revalidatePath("/admin/dashboard");
}

function revalidateDailyReportReviewPages() {
  revalidateDailyReportPages();
  revalidatePath("/admin/daily-reports/print");
}

export async function submitDailyReport(formData: FormData) {
  const profile = await requireEmployeeProfile();
  const supabase = await createClient();
  const reportDate = String(formData.get("report_date") || "");
  let type: "success" | "error" = "success";
  let message = "Daily Report submitted successfully.";

  const admin = createAdminClient();
  const { data: attendance } = await admin
    .from("attendance")
    .select("*")
    .eq("employee_id", profile.id)
    .eq("work_date", reportDate)
    .maybeSingle<AttendanceRecord>();
  const attendanceMessage = dailyReportAttendanceErrorMessage(attendance);

  if (attendanceMessage || !attendance || attendance.total_hours === null) {
    type = "error";
    message = attendanceMessage ?? "Attendance hours are not available for this date.";
  } else {
    const { data: report, error } = await supabase
      .from("daily_reports")
      .insert({
        employee_id: profile.id,
        report_date: reportDate,
        work_summary: String(formData.get("work_summary") || "").trim(),
        tasks_completed: String(formData.get("tasks_completed") || "").trim(),
        pending_work: String(formData.get("pending_work") || "").trim(),
        challenges: String(formData.get("challenges") || "").trim() || null,
        hours_worked: attendance.total_hours,
        tomorrow_plan: String(formData.get("tomorrow_plan") || "").trim() || null
      })
      .select("id")
      .single();

    if (error) {
      type = "error";
      message = dailyReportSubmitErrorMessage(error);
    } else {
      await logAudit("daily_report_submitted", "daily_reports", report.id, {
        attendance_id: attendance.id,
        employee_id: profile.id,
        report_date: reportDate
      });
    }
  }

  revalidateDailyReportPages();
  redirectWithDailyReportMessage(type, message);
}

export async function reviewDailyReport(formData: FormData) {
  const profile = await requireAdminProfile();
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  let returnPath = dailyReportsAdminPath(formData);
  const rawReviewRating = String(formData.get("review_rating") || "");
  const reviewRating = Number(rawReviewRating);
  const reviewComment = String(formData.get("review_comment") || "").trim();
  let type: "success" | "error" = "success";
  let message = "Review saved successfully.";
  const admin = createAdminClient();

  if (!rawReviewRating || !Number.isInteger(reviewRating) || reviewRating < 1 || reviewRating > 5) {
    type = "error";
    message = "Rating is required.";
  }

  const { data: report } = type === "success"
    ? await admin
        .from("daily_reports")
        .select("employee_id, review_status, review_rating, reviewed_at")
        .eq("id", id)
        .maybeSingle<ReviewableDailyReport>()
    : { data: null };

  if (type === "success" && !report) {
    type = "error";
    message = "Report not found.";
  }

  if (type === "success" && report && !canDailyReportBeReviewed(report)) {
    type = "error";
    message = "This report has already been reviewed and cannot be changed.";
  }

  if (type === "success" && report && !isAdminManagerRole(profile.role)) {
    const { data: employee } = await admin
      .from("profiles")
      .select("supervisor_id")
      .eq("id", report.employee_id)
      .maybeSingle<{ supervisor_id: string | null }>();

    if (!employee || employee.supervisor_id !== profile.id) {
      type = "error";
      message = "You are not allowed to review this report.";
    }
  }

  if (type === "success") {
    const { error } = await supabase
      .from("daily_reports")
      .update({
        review_rating: reviewRating,
        review_status: "reviewed",
        review_comment: reviewComment || null,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      type = "error";
      message = dailyReportReviewErrorMessage(error);
    } else {
      returnPath = dailyReportsAdminPath(formData, "all");
      await logAudit("daily_report_reviewed", "daily_reports", id, {
        review_rating: reviewRating
      });
    }
  }

  revalidateDailyReportReviewPages();
  redirectWithDailyReportReviewMessage(returnPath, type, message);
}

export async function resetTestDailyReport(formData: FormData) {
  const profile = await requireAdminProfile();
  const returnPath = dailyReportsAdminPath(formData);
  const reportDate = String(formData.get("report_date") || "");
  const employeeId = String(formData.get("reset_employee_id") || "");
  let type: "success" | "error" = "success";
  let message = "Test daily report reset successfully.";

  if (process.env.ENABLE_TEST_RESET !== "true" || !isAdminManagerRole(profile.role)) {
    type = "error";
    message = "You are not allowed to perform this action.";
  } else if (!reportDate || !employeeId) {
    type = "error";
    message = "Select an employee and report date.";
  }

  if (type === "success") {
    const admin = createAdminClient();
    const { data: deletedReports, error } = await admin
      .from("daily_reports")
      .delete()
      .eq("employee_id", employeeId)
      .eq("report_date", reportDate)
      .select("id");

    if (error) {
      type = "error";
      message = "You are not allowed to perform this action.";
    } else if (!deletedReports?.length) {
      type = "error";
      message = "No daily report found for selected employee/date.";
    } else {
      await logAudit("daily_report_test_reset", "daily_reports", deletedReports[0].id, {
        deleted_report_ids: deletedReports.map((report) => report.id),
        employee_id: employeeId,
        report_date: reportDate,
        reset_by: profile.id
      });
    }
  }

  revalidateDailyReportReviewPages();
  redirectWithDailyReportResetMessage(returnPath, type, message);
}
