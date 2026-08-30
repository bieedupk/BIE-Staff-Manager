import { checkIn, checkOut } from "@/app/actions/attendance";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { attendanceDisplayStatus, getTodayAttendanceForEmployee, getRecentAttendanceForEmployee, buildCompleteTimelineWithAbsent } from "@/lib/attendance";
import { requireEmployeeProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceRecord } from "@/lib/types";
import { formatDate, formatDateTime, todayISO } from "@/lib/utils";

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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeeAttendancePage({
  searchParams
}: {
  searchParams?: Promise<{
    attendance_success?: string;
    attendance_error?: string;
    history_date?: string;
  }>;
}) {
  const profile = await requireEmployeeProfile();
  const today = todayISO();
  const supabase = await createClient();
  const resolvedSearchParams = await searchParams;
  const historyDate = resolvedSearchParams?.history_date || "";
  const historyDateSelected = Boolean(historyDate);

  const [attendance, records] = await Promise.all([
    getTodayAttendanceForEmployee(profile.id, today, "employee-attendance"),
    (async () => {
      if (historyDateSelected) {
        // Specific date filter
        const { data } = await supabase
          .from("attendance")
          .select("*, profiles(id, full_name, email, department, department_id, designation)")
          .eq("employee_id", profile.id)
          .eq("work_date", historyDate)
          .order("check_in_at", { ascending: false });
        return (data ?? []) as AttendanceRecord[];
      } else {
        // Default: recent history with complete timeline including absent days
        const recentRecords = await getRecentAttendanceForEmployee(profile.id, today, "employee-attendance");
        return buildCompleteTimelineWithAbsent(recentRecords, profile, subtractDaysISO(today, DEFAULT_HISTORY_DAYS), today);
      }
    })()
  ]);

  const attendanceStatus = attendanceDisplayStatus(attendance);
  const isShowingRecent = !historyDateSelected;

  return (
    <>
      <PageHeader title="Attendance" subtitle="Check in, check out, and view attendance history by date." backHref="/employee/dashboard" />
      <AttendanceMessage success={resolvedSearchParams?.attendance_success} error={resolvedSearchParams?.attendance_error} />
      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-slate-950">Today - {formatDate(today)}</h2>
            <p className="text-sm font-medium text-slate-500">One attendance record is allowed per employee per day.</p>
          </div>
          <StatusBadge tone="attendance">{attendanceStatus}</StatusBadge>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="font-medium">Check in</p>
            <p>{formatDateTime(attendance?.check_in_at)}</p>
          </div>
          <div>
            <p className="font-medium">Check out</p>
            <p>{formatDateTime(attendance?.check_out_at)}</p>
          </div>
          <div>
            <p className="font-medium">Total</p>
            <p>{attendance?.total_hours ?? "-"} hrs</p>
          </div>
        </div>
        {!attendance ? <div className="mt-4"><EmptyState message="No attendance recorded for today." /></div> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <form action={checkIn}>
            <input type="hidden" name="source_path" value="/employee/attendance" />
            <SubmitButton
              disabled={Boolean(attendance?.check_in_at)}
              pendingText="Checking in..."
              className="min-h-11 w-full rounded-lg bg-bie-700 px-4 font-extrabold text-white disabled:opacity-50 transition hover:bg-bie-800"
            >
              Check In
            </SubmitButton>
          </form>
          <form action={checkOut}>
            <input type="hidden" name="source_path" value="/employee/attendance" />
            <SubmitButton
              disabled={!attendance?.check_in_at || Boolean(attendance?.check_out_at)}
              pendingText="Checking out..."
              className="min-h-11 w-full rounded-lg border border-emerald-200 px-4 font-extrabold text-bie-700 disabled:opacity-50 transition hover:bg-emerald-50"
            >
              Check Out
            </SubmitButton>
          </form>
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-extrabold text-slate-950">
              {isShowingRecent ? "Recent Attendance History" : "Attendance"}
              {historyDateSelected && !isShowingRecent && ` - ${formatDate(historyDate)}`}
            </h2>
            {isShowingRecent && (
              <p className="text-sm font-medium text-slate-500">Last 10 days of records, latest first.</p>
            )}
          </div>
          {!isShowingRecent && (
            <a
              href="/employee/attendance"
              className="inline-block rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
            >
              Clear Filter
            </a>
          )}
        </div>
        <form className="mt-4 grid gap-2 sm:max-w-sm">
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Filter by date (optional)
            <input
              name="history_date"
              type="date"
              defaultValue={historyDate}
              max={today}
              className="min-h-11 rounded-lg border border-slate-300 px-3"
            />
          </label>
          <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Apply Filter</button>
        </form>
        {records.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {records.map((record) => (
              <AttendanceHistoryRecord key={record.id} record={record} />
            ))}
          </div>
        ) : historyDateSelected ? (
          <div className="mt-4">
            <EmptyState message="No attendance found for selected date." />
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState message="No attendance records available." />
          </div>
        )}
      </section>
    </>
  );
}

function AttendanceHistoryRecord({ record }: { record: AttendanceRecord }) {
  return (
    <article className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-extrabold text-slate-950">{formatDate(record.work_date)}</p>
        <StatusBadge tone="attendance">{record.status}</StatusBadge>
      </div>
      <div className="mt-2 grid gap-1 text-sm text-slate-600">
        <p><span className="font-medium">Check in:</span> {formatDateTime(record.check_in_at)}</p>
        <p><span className="font-medium">Check out:</span> {formatDateTime(record.check_out_at)}</p>
        <p><span className="font-medium">Total:</span> {record.total_hours ?? "-"} hrs</p>
      </div>
    </article>
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
