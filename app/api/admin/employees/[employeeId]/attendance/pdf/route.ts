import { requireAdminProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { getEmployeeDepartmentNames } from "@/lib/employee-departments";
import { todayISOInTimezone, formatDurationMinutes, formatDate } from "@/lib/utils";
import { buildCompleteTimelineWithAbsent } from "@/lib/attendance";
import { buildAttendanceReport } from "@/lib/attendance-report";
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
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    if (!fromParam || !toParam) {
      return new Response("Missing date range", { status: 400 });
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
    const todayOrg = todayISOInTimezone(timezone);

    // Sanitize date range (from <= to, to <= todayOrg)
    const from = fromParam > toParam ? toParam : fromParam;
    const to = toParam > todayOrg ? todayOrg : toParam;

    const { data: attendanceData } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date", { ascending: false });

    const actualRecords = attendanceData || [];

    const minimalProfile = {
      id: employee.id,
      full_name: employee.full_name,
      email: employee.email,
      department: employee.department,
      department_id: employee.department_id,
      designation: employee.designation
    };

    const completeTimeline = buildCompleteTimelineWithAbsent(
      actualRecords as any,
      minimalProfile as any,
      from,
      to,
      settings || undefined
    );

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

    const pdfBytes = await buildAttendanceSummaryPdf({
      title: "Attendance Summary",
      employeeName: employee.full_name,
      employeeCode: undefined,
      designation: employee.designation,
      department: departments.length > 0 ? departments.join(", ") : undefined,
      periodLabel: `${formatDate(from)} – ${formatDate(to)}`,
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

    // Sanitize filename
    const safeName = employee.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `attendance-${safeName}-${from}-to-${to}.pdf`;

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
