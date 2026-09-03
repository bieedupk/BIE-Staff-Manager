import { notFound } from "next/navigation";
import { UserCheck, UserX, Timer, CalendarDays, BriefcaseBusiness, Clock3, TrendingUp, Gauge, Download } from "lucide-react";
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
import type { Profile } from "@/lib/types";
import { formatDate, formatDurationMinutes, formatTime, roleLabel, todayISOInTimezone } from "@/lib/utils";
import { buildCompleteTimelineWithAbsent } from "@/lib/attendance";
import { buildAttendanceReport } from "@/lib/attendance-report";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminEmployeeAttendancePage({
  params,
  searchParams
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdminProfile();
  const { employeeId } = await params;
  const resolvedSearchParams = await searchParams;

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
  const todayOrg = todayISOInTimezone(timezone);

  // Simple date math
  const defaultTo = todayOrg;
  const thirtyDaysAgo = new Date(new Date(todayOrg).getTime() - 29 * 24 * 60 * 60 * 1000);
  const defaultFrom = todayISOInTimezone(timezone, thirtyDaysAgo);

  const fromParam = resolvedSearchParams.from || defaultFrom;
  const toParam = resolvedSearchParams.to || defaultTo;

  // Sanitize date range (from <= to, to <= todayOrg)
  const from = fromParam > toParam ? toParam : fromParam;
  const to = toParam > todayOrg ? todayOrg : toParam;

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const daysDiff = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  const inclusiveDays = Math.max(1, daysDiff + 1);
  const daysLabel = inclusiveDays === 1 ? "1 day selected" : `${inclusiveDays} days selected`;

  const { data: attendanceData } = await supabase
    .from("attendance")
    .select("*")
    .eq("employee_id", employee.id)
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: false });

  const actualRecords = attendanceData || [];

  // Need to pass profile that matches what `buildCompleteTimelineWithAbsent` expects
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

  return (
    <>
      <PageHeader
        title="Employee Profile"
        subtitle={`Staff profile details and organizational assignments for ${employee.full_name}.`}
        backHref="/admin/employees"
      />

      <div className="grid gap-6">
        {/* Profile Header Card */}
        <section className="rounded-lg border border-emerald-100 bg-white p-6 shadow-soft">
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

        {/* Future Tab Foundation */}
        <ProfileTabs employeeId={employee.id} activeTab="attendance" />

        <div className="grid gap-5">
          {/* Filters */}
          <div
            className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft motion-safe:animate-fade-up opacity-0"
            style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
          >
            <h2 className="text-sm font-bold text-slate-900">Date Range Filter:</h2>
            <form className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                name="from"
                defaultValue={from}
                max={to}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <span className="text-sm font-semibold text-slate-500">to</span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                min={from}
                max={todayOrg}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
              <button type="submit" className="rounded-md bg-bie-700 px-4 py-1.5 text-sm font-bold text-white transition hover:bg-bie-800">
                Apply
              </button>
              <span className="ms-1 text-xs font-semibold text-slate-500">{daysLabel}</span>
            </form>
            <div className="ml-auto">
              <a
                href={`/api/admin/employees/${employee.id}/attendance/pdf?from=${from}&to=${to}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                <Download className="h-4 w-4" /> Download PDF
              </a>
            </div>
          </div>

          {/* Summary Cards */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Present Days" value={report.totals.presentDays} icon={UserCheck} accent="emerald" delay="50ms" />
            <MetricCard label="Absent Days" value={report.totals.absentDays} icon={UserX} accent="red" delay="100ms" />
            <MetricCard label="Late Arrivals" value={report.totals.lateDays} icon={Timer} accent="amber" delay="150ms" />
            <MetricCard label="Half Days" value={report.totals.halfDays} icon={CalendarDays} accent="orange" delay="200ms" />
            <MetricCard label="Total Work Hours" value={formatDurationMinutes(report.totals.totalWorkingMinutes)} icon={BriefcaseBusiness} accent="blue" delay="250ms" />
            <MetricCard label="Total Overtime" value={formatDurationMinutes(report.totals.totalOvertimeMinutes)} icon={Clock3} accent="slate" delay="300ms" />
            <MetricCard label="Attendance Rate" value={`${Math.round(report.ratios.attendanceRate)}%`} icon={TrendingUp} accent="emerald" delay="350ms" />
            <MetricCard label="Punctuality Rate" value={`${Math.round(report.ratios.punctualityRate)}%`} icon={Gauge} accent="emerald" delay="400ms" />
          </section>

          {/* History List */}
          <section
            className="rounded-lg border border-emerald-100 bg-white shadow-soft motion-safe:animate-fade-up opacity-0"
            style={{ animationDelay: "450ms", animationFillMode: "forwards" }}
          >
            <div className="border-b border-emerald-100 px-5 py-4">
              <h2 className="text-base font-extrabold text-slate-950">Attendance History</h2>
              <p className="text-xs font-medium text-slate-500">
                Detailed check-in and check-out logs for the selected date range.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Check In</th>
                    <th className="px-5 py-3">Check Out</th>
                    <th className="px-5 py-3">Working Duration</th>
                    <th className="px-5 py-3">Overtime</th>
                    <th className="px-5 py-3">Status Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100 bg-white">
                  {report.daily.map((row) => (
                    <tr key={row.date} className="transition hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-900">{formatDate(row.date)}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {row.isPending ? "-" : (row.checkIn ? formatTime(row.checkIn, timezone) : "-")}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {row.isPending ? "-" : (row.checkOut ? formatTime(row.checkOut, timezone) : "-")}
                      </td>
                      <td className="px-5 py-3 text-slate-700 font-medium">
                        {formatDurationMinutes(row.workedMinutes)}
                      </td>
                      <td className="px-5 py-3 text-slate-700 font-medium">
                        {formatDurationMinutes(row.overtimeMinutes)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.isPending && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Pending</span>
                          )}
                          {row.isPresent && (
                            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Present</span>
                          )}
                          {row.isAbsent && (
                            <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">Absent</span>
                          )}
                          {row.isLate && (
                            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Late</span>
                          )}
                          {row.isHalfDay && (
                            <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">Half Day</span>
                          )}
                          {row.isCorrected === true && (
                            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">Corrected</span>
                          )}
                          {!row.isPending && !row.isPresent && !row.isAbsent && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Unknown</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {report.daily.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-sm font-medium text-slate-500">
                        No attendance records found for this date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  accent = "slate",
  delay = "0ms"
}: {
  icon: any;
  label: string;
  value: React.ReactNode;
  accent?: "emerald" | "red" | "amber" | "orange" | "blue" | "slate";
  delay?: string;
}) {
  const iconColors = {
    emerald: "text-emerald-600 bg-emerald-100",
    red: "text-red-600 bg-red-100",
    amber: "text-amber-600 bg-amber-100",
    orange: "text-orange-600 bg-orange-100",
    blue: "text-blue-600 bg-blue-100",
    slate: "text-slate-600 bg-slate-100"
  };

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between motion-safe:animate-fade-up opacity-0"
      style={{ animationDelay: delay, animationFillMode: "forwards" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconColors[accent]}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
            <p className="text-xl font-extrabold text-slate-900 leading-tight">{value}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
