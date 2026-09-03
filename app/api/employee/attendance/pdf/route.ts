import { requireEmployeeProfile } from "@/lib/auth";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { createClient } from "@/lib/supabase/server";
import { buildCompleteTimelineWithAbsent, getRecentAttendanceForEmployee } from "@/lib/attendance";
import { buildAttendanceReport } from "@/lib/attendance-report";
import { buildAttendanceSummaryPdf } from "@/lib/attendance-summary-pdf";
import { todayISOInTimezone, formatDurationMinutes, formatDate } from "@/lib/utils";
import type { AttendanceRecord } from "@/lib/types";

export const runtime = "nodejs";

const DEFAULT_HISTORY_DAYS = 10;

function subtractDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() - days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(request: Request) {
  try {
    const profile = await requireEmployeeProfile();
    const settings = await getOrganizationSettings();
    const timezone = settings?.timezone || "Asia/Karachi";
    const today = todayISOInTimezone(timezone);
    
    const { searchParams } = new URL(request.url);
    const historyDate = searchParams.get("history_date");
    const historyDateSelected = Boolean(historyDate);

    const supabase = await createClient();

    let actualRecords: AttendanceRecord[] = [];
    let from = "";
    let to = "";

    if (historyDateSelected && historyDate) {
      from = historyDate;
      to = historyDate;
      const { data } = await supabase
        .from("attendance")
        .select("*, profiles(id, full_name, email, department, department_id, designation)")
        .eq("employee_id", profile.id)
        .eq("work_date", historyDate)
        .order("check_in_at", { ascending: false });
      actualRecords = (data ?? []) as AttendanceRecord[];
    } else {
      from = subtractDaysISO(today, DEFAULT_HISTORY_DAYS);
      to = today;
      actualRecords = await getRecentAttendanceForEmployee(profile.id, today, "employee-attendance");
    }

    const completeTimeline = buildCompleteTimelineWithAbsent(actualRecords, profile as any, from, to, settings);

    const report = buildAttendanceReport(
      completeTimeline,
      from,
      to,
      settings || {
        office_start_time: "09:00",
        office_end_time: "17:00",
        late_threshold_time: "09:15",
        timezone: "Asia/Karachi"
      }
    );

    const generatedAt = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    });

    let periodLabel = historyDateSelected ? formatDate(historyDate!) : "Recent History";
    let periodSubLabel = historyDateSelected ? null : `Last ${DEFAULT_HISTORY_DAYS} days`;

    const pdfBytes = await buildAttendanceSummaryPdf({
      title: "Attendance Summary",
      employeeName: profile.full_name,
      employeeCode: undefined,
      designation: profile.designation,
      department: profile.department,
      periodLabel: periodLabel,
      periodSubLabel: periodSubLabel,
      daysCovered: report.totals.eligibleDays,
      metrics: [
        { label: "Present Days", value: String(report.totals.presentDays) },
        { label: "Absent Days", value: String(report.totals.absentDays) },
        { label: "Late Arrivals", value: String(report.totals.lateDays) },
        { label: "Half Days", value: String(report.totals.halfDays) },
        { label: "Total Work Hours", value: formatDurationMinutes(report.totals.totalWorkingMinutes) },
        { label: "Total Overtime", value: formatDurationMinutes(report.totals.totalOvertimeMinutes) },
        { label: "Attendance Rate", value: `${Math.round(report.ratios.attendanceRate)}%` },
        { label: "Punctuality Rate", value: `${Math.round(report.ratios.punctualityRate)}%` }
      ],
      generatedAtLabel: generatedAt
    });

    const safeName = profile.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `attendance-${safeName}-${from}${from !== to ? `-to-${to}` : ''}.pdf`;

    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
