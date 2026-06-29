import { correctAttendance } from "@/app/actions/attendance";
import Link from "next/link";
import { AttendanceCorrectionHours } from "@/components/admin/attendance-correction-hours";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { deriveAttendanceFlags, formatDurationFromHours, getRecentAttendanceForAll, buildCompleteTimelineWithAbsent } from "@/lib/attendance";
import { requireAdminProfile } from "@/lib/auth";
import { departmentTextForProfile, fetchEmployeeDepartmentsByEmployee } from "@/lib/employee-departments";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceRecord, Profile } from "@/lib/types";
import { formatDate, formatDateTime, isAdminManagerRole, todayISO } from "@/lib/utils";

type Props = {
  searchParams?: Promise<{
    status?: string;
    employee?: string;
    date?: string;
    attendance_correction_success?: string;
    attendance_correction_error?: string;
  }>;
};

const attendanceFilters = [
  { label: "All", value: "all" },
  { label: "Present", value: "present" },
  { label: "Late", value: "late" },
  { label: "Half-Day", value: "half-day" },
  { label: "Absent", value: "absent" }
] as const;

type AttendanceFilter = (typeof attendanceFilters)[number]["value"];

const DEFAULT_HISTORY_DAYS = 10;
const attendanceCorrectionStatuses = ["Present", "Late", "Half Day", "Absent"] as const;

function subtractDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() - days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function AdminAttendancePage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const currentProfile = await requireAdminProfile();
  const canCorrectAttendance = isAdminManagerRole(currentProfile.role);
  const supabase = canCorrectAttendance ? createAdminClient() : await createClient();
  const today = todayISO();
  const statusFilter = normalizeAttendanceFilter(resolvedSearchParams?.status);
  const employeeFilter = resolvedSearchParams?.employee || "";
  const dateParamProvided = Boolean(resolvedSearchParams?.date);
  const selectedDate = resolvedSearchParams?.date || "";
  const settings = await getOrganizationSettings();

  // Fetch all active employees
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "employee")
    .eq("status", "active")
    .order("full_name");

  const employees = (profiles ?? []) as Profile[];
  const profilesById = new Map(employees.map((employee) => [employee.id, employee]));

  // Decide whether to show recent history or a specific date
  let attendanceRows: AttendanceRecord[] = [];

  if (dateParamProvided) {
    // User selected a specific date - fetch only that date
    let attendanceQuery = supabase
      .from("attendance")
      .select("*, profiles(id, full_name, email, department, department_id, designation)")
      .eq("work_date", selectedDate)
      .order("check_in_at", { ascending: false });

    if (employeeFilter) attendanceQuery = attendanceQuery.eq("employee_id", employeeFilter);

    const { data, error: attendanceError } = await attendanceQuery;

    if (process.env.NODE_ENV !== "production") {
      console.info("[attendance:admin]", {
        selectedDate,
        statusFilter,
        mode: "specific-date",
        adminProfileId: currentProfile.id,
        adminRole: currentProfile.role,
        attendanceFetchedCount: data?.length ?? 0,
        errorCode: attendanceError?.code ?? null
      });
    }

    attendanceRows = attachProfilesToAttendanceRows((data ?? []) as AttendanceRecord[], profilesById);

    // For specific date, add synthetic absent records for employees not present
    const presentIds = new Set(attendanceRows.map((r) => r.employee_id));
    const absentEmployees = employees.filter((emp) => !presentIds.has(emp.id));
    for (const employee of absentEmployees) {
      attendanceRows.push({
        id: `synthetic-absent-${employee.id}-${selectedDate}`,
        employee_id: employee.id,
        work_date: selectedDate,
        check_in_at: null,
        check_out_at: null,
        total_hours: null,
        status: "Absent",
        created_at: new Date().toISOString(),
        profiles: {
          id: employee.id,
          full_name: employee.full_name,
          email: employee.email,
          department: employee.department,
          department_id: employee.department_id,
          designation: employee.designation
        }
      });
    }

    // Sort by date descending
    attendanceRows.sort((a, b) => b.work_date.localeCompare(a.work_date));
  } else {
    // Default: show recent history with complete timeline
    const startDate = subtractDaysISO(today, DEFAULT_HISTORY_DAYS);
    const recentData = attachProfilesToAttendanceRows(
      await getRecentAttendanceForAll(today, "admin-attendance", employeeFilter || undefined),
      profilesById
    );

    // Group records by employee
    const recordsByEmployee = new Map<string, AttendanceRecord[]>();
    for (const record of recentData) {
      const empId = record.employee_id;
      if (!recordsByEmployee.has(empId)) {
        recordsByEmployee.set(empId, []);
      }
      recordsByEmployee.get(empId)!.push(record);
    }

    // Build complete timeline for each employee
    const allRecords: AttendanceRecord[] = [];
    for (const employee of employees) {
      if (employeeFilter && employee.id !== employeeFilter) continue;
      const employeeRecords = recordsByEmployee.get(employee.id) ?? [];
      const timeline = buildCompleteTimelineWithAbsent(employeeRecords, employee, startDate, today);
      allRecords.push(...timeline);
    }

    // Sort by date descending, then by check-in descending
    allRecords.sort((a, b) => {
      const dateCmp = b.work_date.localeCompare(a.work_date);
      if (dateCmp !== 0) return dateCmp;
      const aCheckIn = a.check_in_at ?? "";
      const bCheckIn = b.check_in_at ?? "";
      return bCheckIn.localeCompare(aCheckIn);
    });

    attendanceRows = allRecords;

    if (process.env.NODE_ENV !== "production") {
      console.info("[attendance:admin]", {
        mode: "recent-history",
        adminProfileId: currentProfile.id,
        adminRole: currentProfile.role,
        attendanceFetchedCount: attendanceRows.length,
        employeeFilter: employeeFilter || "all"
      });
    }
  }

  const selectedAttendance = attendanceRows as AttendanceRecord[];
  const attendanceFlagsByRecordId = new Map(selectedAttendance.map((record) => [record.id, deriveAttendanceFlags(record, settings)]));
  const assignmentsByEmployee = await fetchEmployeeDepartmentsByEmployee(supabase, [
    ...employees.map((employee) => employee.id),
    ...selectedAttendance.map((record) => record.employee_id)
  ]);

  const filteredAttendance =
    statusFilter === "all"
      ? selectedAttendance
      : statusFilter === "absent"
        ? selectedAttendance.filter((record) => record.status === "Absent")
        : selectedAttendance.filter((record) => attendanceMatchesFilter(attendanceFlagsByRecordId.get(record.id), statusFilter));

  return (
    <>
      <PageHeader title="Attendance" subtitle="View today's attendance and employee-wise attendance history." backHref="/admin/dashboard" />
      <AttendanceCorrectionMessage
        success={resolvedSearchParams?.attendance_correction_success}
        error={resolvedSearchParams?.attendance_correction_error}
      />

      <section className="mb-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <div className="mb-4 flex flex-col gap-2 sm:items-center sm:justify-between">
          <h2 className="font-extrabold text-slate-950">
            {dateParamProvided ? `Attendance - ${formatDate(selectedDate)}` : "Recent Attendance History"}
          </h2>
          {dateParamProvided && (
            <a
              href="/admin/attendance"
              className="inline-block rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
            >
              Clear Filter
            </a>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {attendanceFilters.map((filter) => (
            <Link
              key={filter.value}
              href={attendanceStatusPath(filter.value, employeeFilter, selectedDate, dateParamProvided)}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                statusFilter === filter.value ? "bg-bie-700 text-white" : "bg-emerald-50 text-bie-700"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </div>
        <form className="mt-4 grid gap-2 sm:max-w-md">
          <input type="hidden" name="status" value={statusFilter} />
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Filter by date (optional)
            <input
              name="date"
              type="date"
              defaultValue={selectedDate}
              max={today}
              className="min-h-11 rounded-lg border border-slate-300 px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Employee filter
            <select name="employee" defaultValue={employeeFilter} className="min-h-11 rounded-lg border border-slate-300 px-3">
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>
          <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Apply Filter</button>
        </form>
      </section>

      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">
          {dateParamProvided ? "Records" : "Recent Attendance"}
        </h2>
          <div className="mt-4 grid gap-3">
            {filteredAttendance.length ? (
              filteredAttendance.map((record) => (
                <article key={record.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{record.profiles?.full_name ?? "Unknown Employee"}</p>
                      <p className="text-sm font-medium text-slate-500">
                        {record.profiles
                          ? `${departmentTextForProfile(record.profiles, assignmentsByEmployee)} | ${record.profiles.designation ?? "No designation"}`
                          : "Not assigned | No designation"}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {(attendanceFlagsByRecordId.get(record.id)?.displayStatuses ?? [record.status]).map((status) => (
                        <StatusBadge key={status} tone="attendance">
                          {status}
                        </StatusBadge>
                      ))}
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-600 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <div>
                      <p className="font-medium text-slate-700">Date</p>
                      <p>{formatDate(record.work_date)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-700">Check in</p>
                      <p>{formatDateTime(record.check_in_at)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-700">Check out</p>
                      <p>{formatDateTime(record.check_out_at)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-slate-700">Total hours</p>
                      <p>{formatDurationFromHours(record.total_hours)}</p>
                    </div>
                  </dl>
                  {canCorrectAttendance ? (
                    <details className="mt-3 border-t border-slate-100 pt-3">
                      <summary className="cursor-pointer text-sm font-extrabold text-bie-700">Correct attendance</summary>
                      <form action={correctAttendance} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <input type="hidden" name="id" value={record.id} />
                        <input type="hidden" name="date" value={selectedDate} />
                        <input type="hidden" name="employee" value={employeeFilter} />
                        <input type="hidden" name="status_filter" value={statusFilter} />
                        {isSyntheticAbsentRecord(record) && (
                          <input type="hidden" name="employee_id" value={record.employee_id} />
                        )}
                        <label className="grid gap-1 text-sm font-bold text-slate-700">
                          Correction date
                          <input
                            name="correction_date"
                            type="date"
                            required
                            defaultValue={record.work_date || selectedDate}
                            max={today}
                            className="min-h-11 rounded-lg border border-slate-300 px-3"
                          />
                        </label>
                        <AttendanceCorrectionHours
                          initialCheckInTime={formatTimeInputValue(record.check_in_at, settings.timezone)}
                          initialCheckOutTime={formatTimeInputValue(record.check_out_at, settings.timezone)}
                        />
                        <label className="grid gap-1 text-sm font-bold text-slate-700">
                          Status
                          <select name="status" defaultValue={record.status} className="min-h-11 rounded-lg border border-slate-300 px-3">
                            {attendanceCorrectionStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-sm font-bold text-slate-700 md:col-span-2 xl:col-span-4">
                          Correction reason
                          <input
                            name="correction_reason"
                            required
                            className="min-h-11 rounded-lg border border-slate-300 px-3"
                          />
                        </label>
                        <button className="min-h-11 self-end rounded-lg bg-bie-700 px-4 font-extrabold text-white">
                          Save correction
                        </button>
                      </form>
                    </details>
                  ) : null}
                </article>
              ))
            ) : (
              <EmptyState
                message={
                  statusFilter === "absent"
                    ? dateParamProvided
                      ? "No absent employees for selected date."
                      : "No absent records in recent history."
                    : dateParamProvided
                      ? "No attendance found for selected date."
                      : "No attendance records available."
                }
              />
            )}
          </div>
      </section>
    </>
  );
}

function normalizeAttendanceFilter(status?: string): AttendanceFilter {
  const normalized = String(status || "all").toLowerCase().replace(/\s+/g, "-");
  if (normalized === "half-day" || normalized === "halfday") return "half-day";
  if (normalized === "present" || normalized === "late" || normalized === "absent" || normalized === "all") return normalized;
  return "all";
}

function attendanceMatchesFilter(flags: ReturnType<typeof deriveAttendanceFlags> | undefined, status: AttendanceFilter) {
  if (!flags) return false;
  if (status === "present") return flags.isPresent;
  if (status === "late") return flags.isLate;
  if (status === "half-day") return flags.isHalfDay;
  return false;
}

function attachProfilesToAttendanceRows(records: AttendanceRecord[], profilesById: Map<string, Profile>): AttendanceRecord[] {
  return records.map((record) => ({
    ...record,
    profiles: profilesById.get(record.employee_id) ?? null
  }));
}

function attendanceStatusPath(status: AttendanceFilter, employee: string, date: string, dateWasProvided: boolean) {
  const params = new URLSearchParams({ status });

  if (employee) params.set("employee", employee);
  if (dateWasProvided && date) params.set("date", date);

  return `/admin/attendance?${params.toString()}`;
}

function isSyntheticAbsentRecord(record: Pick<AttendanceRecord, "id">) {
  return record.id.startsWith("synthetic-absent-");
}

function formatTimeInputValue(value: string | null | undefined, timezone: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone
    }).formatToParts(date);

    const hour = parts.find((part) => part.type === "hour")?.value ?? "";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "";
    return hour && minute ? `${hour}:${minute}` : "";
  } catch {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
}

function AttendanceCorrectionMessage({ success, error }: { success?: string; error?: string }) {
  if (success) {
    return <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{success}</div>;
  }

  if (error) {
    return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>;
  }

  return null;
}
