import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { deriveAttendanceFlags, formatDurationFromHours, getRecentAttendanceForAll } from "@/lib/attendance";
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

  // Decide whether to show recent history or a specific date
  let attendanceRows: AttendanceRecord[] = [];

  if (dateParamProvided) {
    // User selected a specific date - fetch only that date
    let attendanceQuery = supabase
      .from("attendance")
      .select("*, profiles(id, full_name, department, department_id, designation)")
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

    attendanceRows = (data ?? []) as AttendanceRecord[];
  } else {
    // Default: show recent history
    const recentData = await getRecentAttendanceForAll(today, "admin-attendance", employeeFilter || undefined);

    if (process.env.NODE_ENV !== "production") {
      console.info("[attendance:admin]", {
        mode: "recent-history",
        adminProfileId: currentProfile.id,
        adminRole: currentProfile.role,
        attendanceFetchedCount: recentData.length,
        employeeFilter: employeeFilter || "all"
      });
    }

    attendanceRows = recentData;
  }

  const selectedAttendance = attendanceRows as AttendanceRecord[];
  const attendanceFlagsByRecordId = new Map(selectedAttendance.map((record) => [record.id, deriveAttendanceFlags(record, settings)]));
  const assignmentsByEmployee = await fetchEmployeeDepartmentsByEmployee(supabase, [
    ...employees.map((employee) => employee.id),
    ...selectedAttendance.map((record) => record.employee_id)
  ]);
  const presentIds = new Set(selectedAttendance.map((record) => record.employee_id));
  const absentEmployees = dateParamProvided ? employees.filter((employee) => !presentIds.has(employee.id)) : [];

  const filteredAttendance =
    statusFilter === "all"
      ? selectedAttendance
      : statusFilter === "absent"
        ? []
        : selectedAttendance.filter((record) => attendanceMatchesFilter(attendanceFlagsByRecordId.get(record.id), statusFilter));
  const showAbsentEmployees = (statusFilter === "all" || statusFilter === "absent") && dateParamProvided;

  return (
    <>
      <PageHeader title="Attendance" subtitle="View today's attendance and employee-wise attendance history." backHref="/admin/dashboard" />

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
            {filteredAttendance.length || (showAbsentEmployees && absentEmployees.length) ? (
              <>
              {filteredAttendance.map((record) => (
                <article key={record.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{record.profiles?.full_name || "Employee"}</p>
                      <p className="text-sm font-medium text-slate-500">
                        {record.profiles ? departmentTextForProfile(record.profiles, assignmentsByEmployee) : "Not assigned"} | {record.profiles?.designation || "-"}
                      </p>
                    </div>
                    {statusFilter === "all" ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        {(attendanceFlagsByRecordId.get(record.id)?.displayStatuses ?? [record.status]).map((status) => (
                          <StatusBadge key={status} tone="attendance">{status}</StatusBadge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {statusFilter === "all" ? (
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
                  ) : null}
                </article>
              ))}
              {showAbsentEmployees
                ? absentEmployees.map((employee) => (
                    <AttendanceEmployeeCard
                      key={`absent-${employee.id}`}
                      name={employee.full_name}
                      department={departmentTextForProfile(employee, assignmentsByEmployee)}
                      status="Absent"
                    />
                  ))
                : null}
              </>
            ) : (
              <EmptyState 
                message={
                  statusFilter === "absent" 
                    ? (dateParamProvided ? "No absent employees for selected date." : "No absent records available.")
                    : (dateParamProvided ? "No attendance found for selected date." : "No attendance records available.")
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

function attendanceStatusPath(status: AttendanceFilter, employee: string, date: string, dateWasProvided: boolean) {
  const params = new URLSearchParams({ status });

  if (employee) params.set("employee", employee);
  if (dateWasProvided && date) params.set("date", date);

  return `/admin/attendance?${params.toString()}`;
}

function AttendanceEmployeeCard({ name, department, status }: { name: string; department: string; status: "Absent" }) {
  return (
    <article className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-extrabold text-slate-950">{name}</p>
          <p className="text-sm font-medium text-slate-500">{department}</p>
        </div>
        <StatusBadge tone="attendance">{status}</StatusBadge>
      </div>
    </article>
  );
}
