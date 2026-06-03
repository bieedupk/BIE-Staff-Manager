import Link from "next/link";
import { checkIn, checkOut } from "@/app/actions/attendance";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { attendanceDisplayStatus, getTodayAttendanceForEmployee } from "@/lib/attendance";
import { requireEmployeeProfile } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import type { DailyReport, Task } from "@/lib/types";
import { formatDateTime, todayISO } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeeDashboardPage({
  searchParams
}: {
  searchParams?: Promise<{
    attendance_success?: string;
    attendance_error?: string;
  }>;
}) {
  const profile = await requireEmployeeProfile();
  const locale = await getLocale();
  const supabase = await createClient();
  const today = todayISO();
  const resolvedSearchParams = await searchParams;

  const [todayAttendance, { data: tasks }, { data: report }] = await Promise.all([
    getTodayAttendanceForEmployee(profile.id, today, "employee-dashboard"),
    supabase.from("tasks").select("*").eq("assigned_to", profile.id).order("due_date", { ascending: true }),
    supabase.from("daily_reports").select("*").eq("employee_id", profile.id).eq("report_date", today).maybeSingle()
  ]);

  const taskList = (tasks ?? []) as Task[];
  const todayTasks = taskList.filter((task) => task.due_date === today && task.status !== "Completed");
  const pendingTasks = taskList.filter((task) => task.status !== "Completed");
  const completedTasks = taskList.filter((task) => task.status === "Completed");
  const dailyReport = report as DailyReport | null;
  const attendanceStatus = attendanceDisplayStatus(todayAttendance);

  return (
    <>
      <PageHeader title={t("dashboard", locale)} subtitle={t("employeeDashboardSubtitle", locale)} />
      <AttendanceMessage success={resolvedSearchParams?.attendance_success} error={resolvedSearchParams?.attendance_error} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today tasks" value={todayTasks.length} />
        <StatCard label="Pending tasks" value={pendingTasks.length} />
        <StatCard label="Completed tasks" value={completedTasks.length} />
        <StatCard label="Daily report" value={dailyReport ? "Submitted" : "Missing"} />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-slate-950">Today Attendance</h2>
              <p className="text-sm font-medium text-slate-500">Check in once and check out when work ends.</p>
            </div>
            <StatusBadge tone="attendance">{attendanceStatus}</StatusBadge>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-600">
            <p>Check in: {formatDateTime(todayAttendance?.check_in_at)}</p>
            <p>Check out: {formatDateTime(todayAttendance?.check_out_at)}</p>
            <p>Total hours: {todayAttendance?.total_hours ?? "-"}</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <form action={checkIn}>
              <input type="hidden" name="source_path" value="/employee/dashboard" />
              <button disabled={Boolean(todayAttendance?.check_in_at)} className="min-h-11 w-full rounded-lg bg-bie-700 px-4 font-extrabold text-white disabled:opacity-50">
                {t("checkIn", locale)}
              </button>
            </form>
            <form action={checkOut}>
              <input type="hidden" name="source_path" value="/employee/dashboard" />
              <button disabled={!todayAttendance?.check_in_at || Boolean(todayAttendance?.check_out_at)} className="min-h-11 w-full rounded-lg border border-emerald-200 px-4 font-extrabold text-bie-700 disabled:opacity-50">
                {t("checkOut", locale)}
              </button>
            </form>
          </div>
        </div>

        <div className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
          <h2 className="font-extrabold text-slate-950">Quick Actions</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-bie-700" href="/employee/tasks">
              Update tasks
            </Link>
            <Link className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-bie-700" href="/employee/daily-report">
              Submit daily report
            </Link>
            <Link className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-bie-700" href="/employee/leave">
              Request leave
            </Link>
            <Link className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-bie-700" href="/employee/attendance">
              View attendance history
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function AttendanceMessage({ success, error }: { success?: string; error?: string }) {
  if (success) {
    return (
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
        {success}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
        {error}
      </div>
    );
  }

  return null;
}
