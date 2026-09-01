import { ReportDashboard } from "@/components/admin/reports/report-dashboard";
import { notFound, redirect } from "next/navigation";
import { ProfileTabs } from "@/components/admin/profile-tabs";
import { DepartmentBadges } from "@/components/common/department-badges";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth";
import { getAvatarSignedUrl } from "@/lib/avatar";
import { getEmployeeDepartmentNames } from "@/lib/employee-departments";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, AttendanceRecord } from "@/lib/types";
import { formatDate, formatDurationMinutes, roleLabel, todayISOInTimezone, parseTimeToMinutes, formatTime } from "@/lib/utils";
import { buildCompleteTimelineWithAbsent } from "@/lib/attendance";
import { 
  buildAttendanceReport, 
  getWeeklyPeriod, 
  getMonthlyPeriod, 
  getYearlyPeriod, 
  compareAttendanceReports,
  type ReportComparison,
  type MetricComparison
} from "@/lib/attendance-report";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminEmployeeReportsPage({
  params,
  searchParams
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ type?: string; date?: string; month?: string; year?: string }>;
}) {
  await requireAdminProfile();
  const { employeeId } = await params;
  const resolvedParams = await searchParams;

  const type = resolvedParams.type || "weekly";
  if (!["weekly", "monthly", "yearly"].includes(type)) {
    redirect(`/admin/employees/${employeeId}/reports?type=weekly`);
  }

  const supabase = createAdminClient();
  const { data: employee, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", employeeId)
    .single<Profile>();

  if (error || !employee) {
    notFound();
  }

  const [departments, avatarUrl, settings] = await Promise.all([
    getEmployeeDepartmentNames(employee.id, employee.department),
    getAvatarSignedUrl(employee.avatar_path),
    getOrganizationSettings()
  ]);

  const timezone = settings?.timezone || "Asia/Karachi";
  const orgSettings = settings || {
    office_start_time: "09:00",
    office_end_time: "17:00",
    late_threshold_time: "09:15",
    timezone: "Asia/Karachi"
  };

  // 1. Determine periods based on type
  let periodInfo;
  let reportLabelMain = "";
  let reportLabelSub = "";

  if (type === "weekly") {
    periodInfo = getWeeklyPeriod(resolvedParams.date, timezone);
    reportLabelMain = `${formatDate(periodInfo.current.from)} - ${formatDate(periodInfo.current.to)}`;
    reportLabelSub = `Compared with ${formatDate(periodInfo.previous.from)} - ${formatDate(periodInfo.previous.to)}`;
  } else if (type === "monthly") {
    periodInfo = getMonthlyPeriod(resolvedParams.month, timezone);
    reportLabelMain = new Date(`${periodInfo.current.from}T00:00:00Z`).toLocaleString('en', { month: 'long', year: 'numeric' });
    const fromCurDay = parseInt(periodInfo.current.from.substring(8), 10);
    const toCurDay = parseInt(periodInfo.current.to.substring(8), 10);
    const fromPrevDay = parseInt(periodInfo.previous.from.substring(8), 10);
    const toPrevDay = parseInt(periodInfo.previous.to.substring(8), 10);
    const curMon = new Date(`${periodInfo.current.from}T00:00:00Z`).toLocaleString('en', { month: 'short' });
    const prevMon = new Date(`${periodInfo.previous.from}T00:00:00Z`).toLocaleString('en', { month: 'short' });
    reportLabelSub = `${curMon} ${fromCurDay}-${toCurDay} vs ${prevMon} ${fromPrevDay}-${toPrevDay}`;
  } else {
    periodInfo = getYearlyPeriod(resolvedParams.year, timezone);
    const yearStr = periodInfo.current.from.substring(0, 4);
    const prevYearStr = periodInfo.previous.from.substring(0, 4);
    reportLabelMain = `${yearStr} YTD`;
    const curLastDay = new Date(`${periodInfo.current.to}T00:00:00Z`).toLocaleString('en', { month: 'short', day: 'numeric' });
    const prevLastDay = new Date(`${periodInfo.previous.to}T00:00:00Z`).toLocaleString('en', { month: 'short', day: 'numeric' });
    reportLabelSub = `Jan 1-${curLastDay}, ${yearStr} vs Jan 1-${prevLastDay}, ${prevYearStr}`;
  }

  // Optimize Query: fetch from min(previous.from) to max(current.to)
  const minDate = periodInfo.previous.from;
  const maxDate = periodInfo.current.to;

  const { data: rawRecords } = await supabase
    .from("attendance")
    .select("*")
    .eq("employee_id", employee.id)
    .gte("work_date", minDate)
    .lte("work_date", maxDate)
    .order("work_date", { ascending: false });

  const actualRecords = (rawRecords || []) as AttendanceRecord[];

  const minimalProfile = {
    id: employee.id,
    full_name: employee.full_name,
    email: employee.email,
    department: employee.department,
    department_id: employee.department_id,
    designation: employee.designation
  };

  // Build Current Report
  const currentTimeline = buildCompleteTimelineWithAbsent(
    actualRecords,
    minimalProfile as any,
    periodInfo.current.from,
    periodInfo.current.to,
    orgSettings
  );
  const currentReport = buildAttendanceReport(currentTimeline, periodInfo.current.from, periodInfo.current.to, orgSettings);

  // Build Previous Report
  const previousTimeline = buildCompleteTimelineWithAbsent(
    actualRecords,
    minimalProfile as any,
    periodInfo.previous.from,
    periodInfo.previous.to,
    orgSettings
  );
  const previousReport = buildAttendanceReport(previousTimeline, periodInfo.previous.from, periodInfo.previous.to, orgSettings);

  const comparison = compareAttendanceReports(currentReport, previousReport);

  // Averages calculation
  const currentAvgMins = currentReport.totals.completedDays > 0 
    ? Math.round(currentReport.totals.totalWorkingMinutes / currentReport.totals.completedDays) 
    : 0;

  // Graph Data
  const scheduledMins = Math.max(0, (parseTimeToMinutes(orgSettings.office_end_time) ?? 0) - (parseTimeToMinutes(orgSettings.office_start_time) ?? 0));
  const scheduledStartMins = parseTimeToMinutes(orgSettings.office_start_time) ?? undefined;
  
  let workingHoursData: any[] = [];
  let checkInTrendData: any[] = [];
  let trendData: { label: string; value: number }[] = [];
  let yearlyMonthsData: any[] = [];
  
  if (type !== "yearly") {
    workingHoursData = currentReport.daily
      .slice()
      .reverse() // chronological for charts
      .map(r => ({
        label: r.date.substring(5), // MM-DD
        value: r.workedMinutes,
        reference: scheduledMins > 0 ? scheduledMins : undefined
      }));

    checkInTrendData = currentReport.daily
      .slice()
      .reverse()
      .map(r => {
        let val = null;
        if (r.checkIn) {
          const timeStr = formatTime(r.checkIn, timezone);
          val = parseTimeToMinutes(timeStr);
        }
        return {
          label: r.date.substring(5),
          value: val,
          reference: scheduledStartMins,
          timezone: timezone,
          rawTime: r.checkIn
        };
      });
  }

  if (type === "yearly") {
    // Generate 12 months for trend and table
    for (let month = 1; month <= 12; month++) {
      const monthStr = month.toString().padStart(2, "0");
      const yearStr = periodInfo.current.from.substring(0, 4);
      const mFrom = `${yearStr}-${monthStr}-01`;
      
      const nextM = new Date(`${yearStr}-${monthStr}-01T00:00:00Z`);
      nextM.setUTCMonth(nextM.getUTCMonth() + 1);
      nextM.setUTCDate(0);
      const mToFull = nextM.toISOString().split("T")[0];
      const todayOrg = todayISOInTimezone(timezone);
      
      if (mFrom > todayOrg) continue;
      
      const mTo = mToFull > todayOrg ? todayOrg : mToFull;
      
      const mTimeline = buildCompleteTimelineWithAbsent(
        actualRecords,
        minimalProfile as any,
        mFrom,
        mTo,
        orgSettings
      );
      const mReport = buildAttendanceReport(mTimeline, mFrom, mTo, orgSettings);
      
      const label = new Date(`${mFrom}T00:00:00Z`).toLocaleString('en', { month: 'short' });
      trendData.push({
        label: label,
        value: mReport.ratios.attendanceRate
      });
      
      const mAvgMins = mReport.totals.completedDays > 0 ? Math.round(mReport.totals.totalWorkingMinutes / mReport.totals.completedDays) : 0;
      workingHoursData.push({
        label: label,
        value: mAvgMins,
        reference: scheduledMins > 0 ? scheduledMins : undefined
      });
      
      yearlyMonthsData.push({
        month: label,
        report: mReport
      });
    }
  } else if (type === "monthly" || type === "weekly") {
    // Cumulative date-based trend
    let cumEligible = 0;
    let cumPresent = 0;
    
    // Process chronologically
    const chronologicalDaily = [...currentReport.daily].reverse();
    
    for (const r of chronologicalDaily) {
      if (!r.isPending) {
        cumEligible++;
        if (r.isPresent) cumPresent++;
      }
      
      const rate = cumEligible > 0 ? (cumPresent / cumEligible) * 100 : 0;
      
      // Only show up to today/relevant dates
      if (!r.isPending) {
        const label = type === "monthly" 
          ? parseInt(r.date.substring(8), 10).toString() 
          : new Date(r.date).toLocaleDateString('en', { weekday: 'short' }); 
          
        trendData.push({
          label,
          value: rate
        });
      }
    }
  }

  // Titles
  const trendTitle = type === "yearly" ? "Yearly Attendance Trend" : type === "monthly" ? "Monthly Attendance Trend" : "Weekly Attendance Trend";
  const hoursTitle = type === "yearly" ? "Yearly Working Hours Trend" : type === "monthly" ? "Monthly Working Hours Trend" : "Weekly Working Hours";

  const animationKey = type + (resolvedParams.date || "") + (resolvedParams.month || "") + (resolvedParams.year || "");

  return (
    <>
      <PageHeader
        title="Employee Reports"
        subtitle={`Attendance and performance analytics for ${employee.full_name}.`}
        backHref="/admin/employees"
      />

      <div className="rounded-2xl bg-bie-50/30 p-3 sm:p-6 -mx-3 sm:-mx-6 mt-2 ring-1 ring-slate-100">
        <div className="grid gap-6">
        {/* Profile Header Card */}
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <Avatar src={avatarUrl} name={employee.full_name} size="2xl" />

            <div className="flex min-w-0 flex-1 flex-col items-center text-center sm:items-start sm:text-start">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1 className="text-2xl font-extrabold text-slate-950">{employee.full_name}</h1>
                {employee.employee_type ? (
                  <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {employee.employee_type}
                  </span>
                ) : null}
              </div>
              {employee.designation ? (
                <p className="mt-1 text-sm font-semibold text-slate-700">{employee.designation}</p>
              ) : null}
              <p className="text-sm font-medium text-slate-500">{employee.email}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <StatusBadge>{roleLabel(employee.role)}</StatusBadge>
                <StatusBadge tone="employee">{roleLabel(employee.status)}</StatusBadge>
                <DepartmentBadges departments={departments} />
              </div>
            </div>
          </div>
        </section>

        <ProfileTabs employeeId={employee.id} activeTab="reports" />

                <ReportDashboard
          employeeId={employee.id}
          type={type}
          timezone={timezone}
          resolvedParams={resolvedParams as any}
          reportLabelMain={reportLabelMain}
          reportLabelSub={reportLabelSub}
          currentReport={currentReport}
          previousReport={previousReport}
          comparison={comparison}
          trendData={trendData}
          trendTitle={trendTitle}
          workingHoursData={workingHoursData}
          hoursTitle={hoursTitle}
          checkInTrendData={checkInTrendData}
          currentAvgMins={currentAvgMins}
          scheduledMins={scheduledMins}
          yearlyMonthsData={yearlyMonthsData}
          periodInfo={periodInfo}
        />
        </div>
      </div>
    </>
  );
}
