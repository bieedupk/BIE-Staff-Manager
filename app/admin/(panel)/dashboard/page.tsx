import Link from "next/link";
import { LiveClock } from "@/components/layout/live-clock";
import { StatCard } from "@/components/ui/stat-card";
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
    supabase.from("attendance").select("employee_id, status").eq("work_date", today),
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
  const activeEmployeeCount = activeEmployees.length;
  const presentToday = activeAttendanceToday.filter((item) => item.status === "Present" || item.status === "Half Day").length;
  const lateToday = activeAttendanceToday.filter((item) => item.status === "Late").length;
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
        <StatCard label="Active employees" value={activeEmployeeCount} href="/admin/employees" />
        <StatCard label="Total staff records" value={staffRecords.length} href="/admin/employees" />
        <StatCard label={t("presentToday", locale)} value={presentToday} href="/admin/attendance" />
        <StatCard label={t("absentToday", locale)} value={absentToday} href="/admin/attendance" />
        <StatCard label={t("lateToday", locale)} value={lateToday} href="/admin/attendance" />
        <StatCard label="Reports submitted today" value={reportEmployees.size} hint={formatDate(today)} href="/admin/daily-reports" />
        <StatCard label="Reports missing today" value={missingReports} href="/admin/daily-reports" />
        <StatCard label={t("pendingTasks", locale)} value={pendingTasks.count ?? 0} href="/admin/tasks" />
        <StatCard label={t("pendingLeaves", locale)} value={pendingLeaves.count ?? 0} href="/admin/leaves" />
      </section>

      <section className="mt-6 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <div>
          <h2 className="font-extrabold text-slate-950">Today&apos;s Action Required</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Daily checks that need a manager&apos;s attention.</p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <ActionCount label="Absent employees" value={absentToday} href="/admin/attendance" />
          <ActionCount label="Late employees" value={lateToday} href="/admin/attendance" />
          <ActionCount label="Missing daily reports" value={missingReports} href="/admin/daily-reports" />
          <ActionCount label="Pending leave requests" value={pendingLeaves.count ?? 0} href="/admin/leaves" />
          <ActionCount label="Overdue tasks" value={overdueTasks.count ?? 0} href="/admin/tasks" />
        </div>
      </section>

    </>
  );
}

function ActionCount({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-20 items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 transition hover:border-emerald-200 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
    >
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <span className="text-2xl font-extrabold text-bie-700">{value}</span>
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
