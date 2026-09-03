import Link from "next/link";
import {
  UserCheck,
  UsersRound,
  UserX,
  Clock,
  Timer,
  ClipboardCheck,
  ClipboardX,
  ListTodo,
  CalendarClock,
  CalendarX,
  type LucideIcon
} from "lucide-react";
import { LiveClock } from "@/components/layout/live-clock";
import { StatCard } from "@/components/ui/stat-card";
import { deriveAttendanceFlags } from "@/lib/attendance";
import { requireAdminProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLocale, t } from "@/lib/i18n";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { formatDate, isAdminManagerRole, isOfficeHoursEnded, todayISOInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const profile = await requireAdminProfile();
  const supabase = isAdminManagerRole(profile.role) ? createAdminClient() : await createClient();
  const settings = await getOrganizationSettings();
  const today = todayISOInTimezone(settings.timezone);

  const [
    locale,
    employees,
    attendanceToday,
    pendingTasks,
    overdueTasks,
    pendingLeaves,
    reportsToday
  ] = await Promise.all([
    getLocale(),
    supabase.from("profiles").select("id, role, status"),
    supabase.from("attendance").select("employee_id, work_date, check_in_at, check_out_at, total_hours, status").eq("work_date", today),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "Pending"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .neq("status", "Completed")
      .lt("due_date", today),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "Pending"),
    supabase.from("daily_reports").select("employee_id").eq("report_date", today)
  ]);

  const staffRecords = employees.data ?? [];
  const activeEmployees = staffRecords.filter((employee) => employee.role === "employee" && employee.status === "active");
  const activeEmployeeIds = new Set(activeEmployees.map((employee) => employee.id));
  const activeAttendanceToday = (attendanceToday.data ?? []).filter((item) => activeEmployeeIds.has(item.employee_id));
  const activeAttendanceEmployeeIds = new Set(activeAttendanceToday.map((item) => item.employee_id));
  const activeAttendanceFlags = activeAttendanceToday.map((item) => deriveAttendanceFlags(item, settings));
  const activeEmployeeCount = activeEmployees.length;
  const presentToday = activeAttendanceFlags.filter((flags) => flags.isPresent).length;
  const lateToday = activeAttendanceFlags.filter((flags) => flags.isLate).length;
  const halfDayToday = activeAttendanceFlags.filter((flags) => flags.isHalfDay).length;
  const reportEmployees = new Set((reportsToday.data ?? []).filter((item) => activeEmployeeIds.has(item.employee_id)).map((item) => item.employee_id));
  const missingReports = Math.max(activeEmployeeCount - reportEmployees.size, 0);
  const officeEndedToday = isOfficeHoursEnded(settings);
  const actualAbsentToday = activeAttendanceFlags.filter((flags) => flags.isAbsent).length;
  const missingAbsentToday = officeEndedToday
    ? activeEmployees.filter((employee) => !activeAttendanceEmployeeIds.has(employee.id)).length
    : 0;
  const absentToday = actualAbsentToday + missingAbsentToday;

  return (
    <>
      <section className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-start motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '0ms', animationFillMode: 'forwards' }}>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">{t("dashboard", locale)}</h1>
          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">{t("adminDashboardSubtitle", locale)}</p>
        </div>
        <div className="flex justify-start md:justify-center">
          <LiveClock timezone={settings.timezone} serverNow={new Date().toISOString()} />
        </div>
        <div className="flex md:justify-end">
          <OfficeTiming
            officeStartTime={settings.office_start_time}
            officeEndTime={settings.office_end_time}
            lateThresholdTime={settings.late_threshold_time}
          />
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active employees" value={activeEmployeeCount} href="/admin/employees" icon={UserCheck} accent="emerald" animationDelay={50} />
        <StatCard label="Total staff records" value={staffRecords.length} href="/admin/employees" icon={UsersRound} accent="slate" animationDelay={100} />
        <StatCard label={t("presentToday", locale)} value={presentToday} href="/admin/attendance?status=present" icon={UserCheck} accent="emerald" animationDelay={150} />
        <StatCard label={t("absentToday", locale)} value={absentToday} href="/admin/attendance?status=absent" icon={UserX} accent="red" animationDelay={200} />
        <StatCard label={t("lateToday", locale)} value={lateToday} href="/admin/attendance?status=late" icon={Clock} accent="amber" animationDelay={250} />
        <StatCard label="Half-day today" value={halfDayToday} href="/admin/attendance?status=half-day" icon={Timer} accent="orange" animationDelay={300} />
        <StatCard label="Reports submitted today" value={reportEmployees.size} href="/admin/daily-reports" icon={ClipboardCheck} accent="emerald" animationDelay={350} />
        <StatCard label={t("pendingTasks", locale)} value={pendingTasks.count ?? 0} href="/admin/tasks" icon={ListTodo} accent="blue" animationDelay={400} />
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm motion-safe:animate-fade-up opacity-0" style={{ animationDelay: '450ms', animationFillMode: 'forwards' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-extrabold text-slate-950">Today&apos;s Action Required</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Daily checks that need a manager&apos;s attention.</p>
          </div>
          <Link
            href="/admin/attendance"
            className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
          >
            View Attendance
          </Link>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ActionCount label="Missing daily reports" value={missingReports} href="/admin/daily-reports" icon={ClipboardX} accent="red" />
          <ActionCount label="Pending leave requests" value={pendingLeaves.count ?? 0} href="/admin/leaves" icon={CalendarClock} accent="teal" />
          <ActionCount label="Overdue tasks" value={overdueTasks.count ?? 0} href="/admin/tasks" icon={CalendarX} accent="red" />
        </div>
      </section>

    </>
  );
}

function ActionCount({ label, value, href, icon: Icon, accent = "slate" }: { label: string; value: number; href: string; icon: LucideIcon; accent?: "emerald" | "red" | "amber" | "orange" | "blue" | "slate" | "teal" }) {
  const iconColors = {
    emerald: "text-emerald-600 bg-emerald-100",
    red: "text-red-600 bg-red-100",
    amber: "text-amber-600 bg-amber-100",
    orange: "text-orange-600 bg-orange-100",
    blue: "text-blue-600 bg-blue-100",
    slate: "text-slate-600 bg-slate-100",
    teal: "text-teal-600 bg-teal-100",
  };

  return (
    <Link
      href={href}
      className="flex h-full min-h-[116px] w-full flex-col rounded-xl border border-slate-100 bg-slate-50 px-5 py-4 transition hover:border-slate-200 hover:bg-slate-100 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
    >
      <p className="w-full text-left text-xs font-bold text-slate-500 uppercase tracking-wider leading-snug">
        {label}
      </p>
      <div className="mt-1 flex flex-1 w-full items-center justify-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconColors[accent]}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="text-2xl sm:text-[28px] font-extrabold text-slate-900 leading-none">
          {value}
        </p>
      </div>
    </Link>
  );
}

function OfficeTiming({
  officeStartTime,
  officeEndTime,
  lateThresholdTime
}: {
  officeStartTime: string;
  officeEndTime: string;
  lateThresholdTime: string;
}) {
  return (
    <aside className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
        <Clock className="h-4 w-4" aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs font-extrabold text-slate-900">
          Office {formatOfficeTime(officeStartTime)} - {formatOfficeTime(officeEndTime)}
        </p>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">Late after {formatOfficeTime(lateThresholdTime)}</p>
      </div>
    </aside>
  );
}

function formatOfficeTime(value: string) {
  const [hours = "0", minutes = "00"] = value.split(":");
  const numericHours = Number(hours);
  const displayHours = numericHours % 12 || 12;
  const meridiem = numericHours >= 12 ? "PM" : "AM";

  return `${String(displayHours).padStart(2, "0")}:${minutes} ${meridiem}`;
}
