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
import { formatDate, isAdminManagerRole, todayISO } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const profile = await requireAdminProfile();
  const locale = await getLocale();
  const supabase = isAdminManagerRole(profile.role) ? createAdminClient() : await createClient();
  const today = todayISO();
  const settings = await getOrganizationSettings();

  const [
    employees,
    attendanceToday,
    pendingTasks,
    overdueTasks,
    pendingLeaves,
    reportsToday
  ] = await Promise.all([
    supabase.from("profiles").select("id, role, status"),
    supabase.from("attendance").select("employee_id, check_in_at, check_out_at, total_hours, status").eq("work_date", today),
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
  const absentToday = activeEmployees.filter((employee) => !activeAttendanceEmployeeIds.has(employee.id)).length;

  return (
    <>
      <section className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-start">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">{t("dashboard", locale)}</h1>
          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">{t("adminDashboardSubtitle", locale)}</p>
        </div>
        <div className="flex justify-start md:justify-center">
          <LiveClock timezone={settings.timezone} />
        </div>
        <div className="flex md:justify-end">
          <OfficeTiming
            officeStartTime={settings.office_start_time}
            officeEndTime={settings.office_end_time}
            lateThresholdTime={settings.late_threshold_time}
          />
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Active employees" value={activeEmployeeCount} href="/admin/employees" icon={UserCheck} />
        <StatCard label="Total staff records" value={staffRecords.length} href="/admin/employees" icon={UsersRound} />
        <StatCard label={t("presentToday", locale)} value={presentToday} href="/admin/attendance?status=present" icon={UserCheck} />
        <StatCard label={t("absentToday", locale)} value={absentToday} href="/admin/attendance?status=absent" icon={UserX} />
        <StatCard label={t("lateToday", locale)} value={lateToday} href="/admin/attendance?status=late" icon={Clock} />
        <StatCard label="Half-day today" value={halfDayToday} href="/admin/attendance?status=half-day" icon={Timer} />
        <StatCard label="Reports submitted today" value={reportEmployees.size} hint={formatDate(today)} href="/admin/daily-reports" icon={ClipboardCheck} />
        <StatCard label="Reports missing today" value={missingReports} href="/admin/daily-reports" icon={ClipboardX} />
        <StatCard label={t("pendingTasks", locale)} value={pendingTasks.count ?? 0} href="/admin/tasks" icon={ListTodo} />
        <StatCard label={t("pendingLeaves", locale)} value={pendingLeaves.count ?? 0} href="/admin/leaves" icon={CalendarClock} />
      </section>

      <section className="mt-6 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-extrabold text-slate-950">Today&apos;s Action Required</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Daily checks that need a manager&apos;s attention.</p>
          </div>
          <Link
            href="/admin/attendance"
            className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-bie-700 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
          >
            View Attendance
          </Link>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <ActionCount label="Absent employees" value={absentToday} href="/admin/attendance?status=absent" icon={UserX} />
          <ActionCount label="Late employees" value={lateToday} href="/admin/attendance?status=late" icon={Clock} />
          <ActionCount label="Half-day employees" value={halfDayToday} href="/admin/attendance?status=half-day" icon={Timer} />
          <ActionCount label="Missing daily reports" value={missingReports} href="/admin/daily-reports" icon={ClipboardX} />
          <ActionCount label="Pending leave requests" value={pendingLeaves.count ?? 0} href="/admin/leaves" icon={CalendarClock} />
          <ActionCount label="Overdue tasks" value={overdueTasks.count ?? 0} href="/admin/tasks" icon={CalendarX} />
        </div>
      </section>

    </>
  );
}

function ActionCount({ label, value, href, icon: Icon }: { label: string; value: number; href: string; icon: LucideIcon }) {
  return (
    <Link
      href={href}
      className="relative flex min-h-20 items-center justify-between gap-3 overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50 p-4 transition hover:border-emerald-200 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
    >
      <Icon
        className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-200"
        size={56}
        strokeWidth={1.25}
        aria-hidden="true"
      />
      <div className="relative">
        <p className="text-sm font-bold text-slate-700">{label}</p>
        <p className="mt-1 text-2xl font-extrabold text-bie-700">{value}</p>
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
    <aside className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm shadow-soft">
      <p className="font-extrabold text-slate-950">
        Office {formatOfficeTime(officeStartTime)} - {formatOfficeTime(officeEndTime)}
      </p>
      <p className="mt-0.5 font-semibold text-slate-500">Late after {formatOfficeTime(lateThresholdTime)}</p>
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
