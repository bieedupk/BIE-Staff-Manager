import Link from "next/link";
import {
  CalendarClock,
  ListTodo,
  CheckCircle2,
  ClipboardCheck,
  ClipboardX,
  Clock
} from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { checkIn, checkOut } from "@/app/actions/attendance";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { attendanceDisplayStatus, getTodayAttendanceForEmployee } from "@/lib/attendance";
import { requireEmployeeProfile } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import type { DailyReport, Task } from "@/lib/types";
import { formatDate, formatDateTime, todayISO } from "@/lib/utils";

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
  const today = todayISO();
  const supabase = await createClient();

  const [locale, resolvedSearchParams, todayAttendance, { data: tasks }, { data: report }] = await Promise.all([
    getLocale(),
    searchParams,
    getTodayAttendanceForEmployee(profile.id, today, "employee-dashboard"),
    supabase.from("tasks").select("id, status, due_date").eq("assigned_to", profile.id).order("due_date", { ascending: true }),
    supabase.from("daily_reports").select("id").eq("employee_id", profile.id).eq("report_date", today).maybeSingle()
  ]);

  const taskList = (tasks ?? []) as Task[];
  const todayTasks = taskList.filter((task) => task.due_date === today && task.status !== "Completed");
  const pendingTasks = taskList.filter((task) => task.status !== "Completed");
  const completedTasks = taskList.filter((task) => task.status === "Completed");
  const dailyReport = report as Pick<DailyReport, "id"> | null;
  const attendanceStatus = attendanceDisplayStatus(todayAttendance);

  return (
    <>
      <PageHeader title={t("dashboard", locale)} subtitle={t("employeeDashboardSubtitle", locale)} />
      <AttendanceMessage success={resolvedSearchParams?.attendance_success} error={resolvedSearchParams?.attendance_error} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today tasks" value={todayTasks.length} hint={formatDate(today)} href="/employee/tasks" icon={CalendarClock} />
        <StatCard label="Pending tasks" value={pendingTasks.length} href="/employee/tasks" icon={ListTodo} />
        <StatCard label="Completed tasks" value={completedTasks.length} href="/employee/tasks" icon={CheckCircle2} />
        <StatCard
          label="Daily report"
          value={dailyReport ? "Submitted" : "Missing"}
          hint={formatDate(today)}
          href="/employee/daily-report"
          icon={dailyReport ? ClipboardCheck : ClipboardX}
        />
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
          <div className="mt-4 grid gap-2 text-sm text-slate-600 grid-cols-1 sm:grid-cols-3">
            <div>
              <p className="font-medium text-slate-700">Check in</p>
              <p>{formatDateTime(todayAttendance?.check_in_at)}</p>
            </div>
            <div>
              <p className="font-medium text-slate-700">Check out</p>
              <p>{formatDateTime(todayAttendance?.check_out_at)}</p>
            </div>
            <div>
              <p className="font-medium text-slate-700">Total hours</p>
              <p>{todayAttendance?.total_hours ?? "-"}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <form action={checkIn}>
              <input type="hidden" name="source_path" value="/employee/dashboard" />
              <SubmitButton
                disabled={Boolean(todayAttendance?.check_in_at)}
                pendingText="Checking in..."
                className="min-h-11 w-full rounded-lg bg-bie-700 px-4 font-extrabold text-white disabled:opacity-50 transition hover:bg-bie-800"
              >
                {t("checkIn", locale)}
              </SubmitButton>
            </form>
            <form action={checkOut}>
              <input type="hidden" name="source_path" value="/employee/dashboard" />
              <SubmitButton
                disabled={!todayAttendance?.check_in_at || Boolean(todayAttendance?.check_out_at)}
                pendingText="Checking out..."
                className="min-h-11 w-full rounded-lg border border-emerald-200 px-4 font-extrabold text-bie-700 disabled:opacity-50 transition hover:bg-emerald-50"
              >
                {t("checkOut", locale)}
              </SubmitButton>
            </form>
          </div>
        </div>

        <div className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
          <div>
            <h2 className="font-extrabold text-slate-950">Quick Actions</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Shortcuts to manage your daily tasks, reports, and leaves.</p>
          </div>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <Link
              className="relative flex items-center justify-between overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50 p-3.5 text-sm font-bold text-bie-700 transition hover:border-emerald-200 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
              href="/employee/tasks"
            >
              <span>Update tasks</span>
              <ListTodo className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            </Link>
            <Link
              className="relative flex items-center justify-between overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50 p-3.5 text-sm font-bold text-bie-700 transition hover:border-emerald-200 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
              href="/employee/daily-report"
            >
              <span>Submit daily report</span>
              <ClipboardCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            </Link>
            <Link
              className="relative flex items-center justify-between overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50 p-3.5 text-sm font-bold text-bie-700 transition hover:border-emerald-200 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
              href="/employee/leave"
            >
              <span>Request leave</span>
              <CalendarClock className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            </Link>
            <Link
              className="relative flex items-center justify-between overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50 p-3.5 text-sm font-bold text-bie-700 transition hover:border-emerald-200 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
              href="/employee/attendance"
            >
              <span>View attendance history</span>
              <Clock className="h-5 w-5 text-emerald-600" aria-hidden="true" />
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
