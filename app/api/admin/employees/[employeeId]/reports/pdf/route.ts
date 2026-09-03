import { requireAdminProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { getEmployeeDepartmentNames } from "@/lib/employee-departments";
import { todayISOInTimezone, formatDurationMinutes, formatDate } from "@/lib/utils";
import { buildCompleteTimelineWithAbsent } from "@/lib/attendance";
import { buildAttendanceReport, getWeeklyPeriod, getMonthlyPeriod, getYearlyPeriod, compareAttendanceReports } from "@/lib/attendance-report";
import { buildAttendanceSummaryPdf } from "@/lib/attendance-summary-pdf";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    await requireAdminProfile();
    const { employeeId } = await params;
    
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "weekly";
    
    if (!["weekly", "monthly", "yearly"].includes(type)) {
      return new Response("Invalid report type", { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: employee, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", employeeId)
      .single();

    if (error || !employee) {
      return new Response("Employee not found", { status: 404 });
    }

    const [departments, settings] = await Promise.all([
      getEmployeeDepartmentNames(employee.id, employee.department),
      getOrganizationSettings()
    ]);

    const timezone = settings?.timezone || "Asia/Karachi";
    const orgSettings = settings || {
      office_start_time: "09:00",
      office_end_time: "17:00",
      late_threshold_time: "09:15",
      timezone: "Asia/Karachi"
    };

    let periodInfo;
    let reportLabelMain = "";
    let reportLabelSub = "";

    if (type === "weekly") {
      periodInfo = getWeeklyPeriod(searchParams.get("date") || undefined, timezone);
      reportLabelMain = `${formatDate(periodInfo.current.from)} - ${formatDate(periodInfo.current.to)}`;
      reportLabelSub = `Compared with ${formatDate(periodInfo.previous.from)} - ${formatDate(periodInfo.previous.to)}`;
    } else if (type === "monthly") {
      periodInfo = getMonthlyPeriod(searchParams.get("month") || undefined, timezone);
      reportLabelMain = new Date(`${periodInfo.current.from}T00:00:00Z`).toLocaleString('en', { month: 'long', year: 'numeric' });
      const fromCurDay = parseInt(periodInfo.current.from.substring(8), 10);
      const toCurDay = parseInt(periodInfo.current.to.substring(8), 10);
      const fromPrevDay = parseInt(periodInfo.previous.from.substring(8), 10);
      const toPrevDay = parseInt(periodInfo.previous.to.substring(8), 10);
      const curMon = new Date(`${periodInfo.current.from}T00:00:00Z`).toLocaleString('en', { month: 'short' });
      const prevMon = new Date(`${periodInfo.previous.from}T00:00:00Z`).toLocaleString('en', { month: 'short' });
      reportLabelSub = `${curMon} ${fromCurDay}-${toCurDay} vs ${prevMon} ${fromPrevDay}-${toPrevDay}`;
    } else {
      periodInfo = getYearlyPeriod(searchParams.get("year") || undefined, timezone);
      const yearStr = periodInfo.current.from.substring(0, 4);
      const prevYearStr = periodInfo.previous.from.substring(0, 4);
      reportLabelMain = `${yearStr} YTD`;
      const curLastDay = new Date(`${periodInfo.current.to}T00:00:00Z`).toLocaleString('en', { month: 'short', day: 'numeric' });
      const prevLastDay = new Date(`${periodInfo.previous.to}T00:00:00Z`).toLocaleString('en', { month: 'short', day: 'numeric' });
      reportLabelSub = `Jan 1-${curLastDay}, ${yearStr} vs Jan 1-${prevLastDay}, ${prevYearStr}`;
    }

    const minDate = periodInfo.previous.from;
    const maxDate = periodInfo.current.to;

    const { data: rawRecords } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("work_date", minDate)
      .lte("work_date", maxDate)
      .order("work_date", { ascending: false });

    const actualRecords = (rawRecords || []);

    const minimalProfile = {
      id: employee.id,
      full_name: employee.full_name,
      email: employee.email,
      department: employee.department,
      department_id: employee.department_id,
      designation: employee.designation
    };

    const currentTimeline = buildCompleteTimelineWithAbsent(
      actualRecords as any,
      minimalProfile as any,
      periodInfo.current.from,
      periodInfo.current.to,
      orgSettings
    );
    const currentReport = buildAttendanceReport(currentTimeline, periodInfo.current.from, periodInfo.current.to, orgSettings);

    const previousTimeline = buildCompleteTimelineWithAbsent(
      actualRecords as any,
      minimalProfile as any,
      periodInfo.previous.from,
      periodInfo.previous.to,
      orgSettings
    );
    const previousReport = buildAttendanceReport(previousTimeline, periodInfo.previous.from, periodInfo.previous.to, orgSettings);

    const comparison = compareAttendanceReports(currentReport, previousReport);

    const generatedAt = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    });

    const titleMap = {
      weekly: "Weekly Attendance Report",
      monthly: "Monthly Attendance Report",
      yearly: "Yearly Attendance Report"
    };

    const formatComparison = (delta: number) => {
      const sign = delta > 0 ? "+" : delta < 0 ? "" : "";
      return delta === 0 ? "0 pp" : `${sign}${Math.round(delta)} pp`;
    };

    const compRows = [
      { 
        label: "Attendance Rate", 
        value: `${Math.round(previousReport.ratios.attendanceRate)}% -> ${Math.round(currentReport.ratios.attendanceRate)}%  (${formatComparison(comparison.attendanceRate.delta)})`
      },
      { 
        label: "Punctuality Rate", 
        value: `${Math.round(previousReport.ratios.punctualityRate)}% -> ${Math.round(currentReport.ratios.punctualityRate)}%  (${formatComparison(comparison.punctualityRate.delta)})` 
      }
    ];

    const pdfBytes = await buildAttendanceSummaryPdf({
      title: titleMap[type as keyof typeof titleMap],
      employeeName: employee.full_name,
      employeeCode: undefined,
      designation: employee.designation,
      department: departments.length > 0 ? departments.join(", ") : undefined,
      periodLabel: reportLabelMain,
      periodSubLabel: reportLabelSub,
      daysCovered: currentReport.totals.eligibleDays,
      metrics: [
        { label: "Present Days", value: String(currentReport.totals.presentDays) },
        { label: "Absent Days", value: String(currentReport.totals.absentDays) },
        { label: "Late Arrivals", value: String(currentReport.totals.lateDays) },
        { label: "Half Days", value: String(currentReport.totals.halfDays) },
        { label: "Total Work Hours", value: formatDurationMinutes(currentReport.totals.totalWorkingMinutes) },
        { label: "Total Overtime", value: formatDurationMinutes(currentReport.totals.totalOvertimeMinutes) },
        { label: "Attendance Rate", value: `${Math.round(currentReport.ratios.attendanceRate)}%` },
        { label: "Punctuality Rate", value: `${Math.round(currentReport.ratios.punctualityRate)}%` }
      ],
      comparisonRows: compRows,
      generatedAtLabel: generatedAt
    });

    let periodStr = "";
    if (type === "weekly") {
      periodStr = searchParams.get("date") || periodInfo.current.from;
    } else if (type === "monthly") {
      periodStr = searchParams.get("month") || periodInfo.current.from.substring(0, 7);
    } else {
      periodStr = searchParams.get("year") || periodInfo.current.from.substring(0, 4);
    }

    const safeName = employee.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${type}-attendance-report-${safeName}-${periodStr}.pdf`;

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
