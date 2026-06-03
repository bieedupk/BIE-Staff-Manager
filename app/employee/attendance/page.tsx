import { checkIn, checkOut } from "@/app/actions/attendance";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { attendanceDisplayStatus, getTodayAttendanceForEmployee } from "@/lib/attendance";
import { requireEmployeeProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceRecord } from "@/lib/types";
import { formatDate, formatDateTime, todayISO } from "@/lib/utils";

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
  const resolvedSearchParams = await searchParams;
  const historyDate = resolvedSearchParams?.history_date || "";
  const historyDateSelected = Boolean(historyDate);
  const selectedToday = historyDate === today;
  const supabase = await createClient();
  const [attendance, { data: historyRows }] = await Promise.all([
    getTodayAttendanceForEmployee(profile.id, today, "employee-attendance"),
    historyDateSelected && !selectedToday
      ? supabase
          .from("attendance")
          .select("*")
          .eq("employee_id", profile.id)
          .eq("work_date", historyDate)
          .order("check_in_at", { ascending: false })
      : { data: [] as AttendanceRecord[] }
  ]);
  const records = (historyRows ?? []) as AttendanceRecord[];
  const attendanceStatus = attendanceDisplayStatus(attendance);

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
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <p>Check in: {formatDateTime(attendance?.check_in_at)}</p>
          <p>Check out: {formatDateTime(attendance?.check_out_at)}</p>
          <p>Total: {attendance?.total_hours ?? "-"} hrs</p>
        </div>
        {!attendance ? <div className="mt-4"><EmptyState message="No attendance recorded for today." /></div> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <form action={checkIn}>
            <input type="hidden" name="source_path" value="/employee/attendance" />
            <button disabled={Boolean(attendance?.check_in_at)} className="min-h-11 w-full rounded-lg bg-bie-700 px-4 font-extrabold text-white disabled:opacity-50">
              Check In
            </button>
          </form>
          <form action={checkOut}>
            <input type="hidden" name="source_path" value="/employee/attendance" />
            <button disabled={!attendance?.check_in_at || Boolean(attendance?.check_out_at)} className="min-h-11 w-full rounded-lg border border-emerald-200 px-4 font-extrabold text-bie-700 disabled:opacity-50">
              Check Out
            </button>
          </form>
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">View history by date</h2>
        <form className="mt-4 grid gap-2 sm:max-w-sm">
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Date
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
        {historyDateSelected ? (
          <div className="mt-4 grid gap-3">
            {selectedToday ? (
              attendance ? (
                <p className="rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-600">
                  Today&apos;s attendance is shown above.
                </p>
              ) : (
                <EmptyState message="No attendance found for selected date." />
              )
            ) : records.length ? (
              records.map((record) => <AttendanceHistoryRecord key={record.id} record={record} />)
            ) : (
              <EmptyState message="No attendance found for selected date." />
            )}
          </div>
        ) : null}
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
      <p className="mt-2 text-sm text-slate-600">
        {formatDateTime(record.check_in_at)} to {formatDateTime(record.check_out_at)} - {record.total_hours ?? "-"} hrs
      </p>
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
