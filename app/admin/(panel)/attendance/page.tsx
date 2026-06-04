import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth";
import { departmentTextForProfile, fetchEmployeeDepartmentsByEmployee } from "@/lib/employee-departments";
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

export default async function AdminAttendancePage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const currentProfile = await requireAdminProfile();
  const canCorrectAttendance = isAdminManagerRole(currentProfile.role);
  const supabase = canCorrectAttendance ? createAdminClient() : await createClient();
  const today = todayISO();
  const statusFilter = resolvedSearchParams?.status || "All";
  const employeeFilter = resolvedSearchParams?.employee || "";
  const selectedDate = resolvedSearchParams?.date || today;

  let attendanceQuery = supabase
    .from("attendance")
    .select("*, profiles(id, full_name, department, department_id, designation)")
    .eq("work_date", selectedDate)
    .order("check_in_at", { ascending: false });

  if (employeeFilter) attendanceQuery = attendanceQuery.eq("employee_id", employeeFilter);

  const [{ data: profiles }, { data: attendanceRows, error: attendanceError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "employee").eq("status", "active").order("full_name"),
    attendanceQuery
  ]);

  if (process.env.NODE_ENV !== "production") {
    console.info("[attendance:admin]", {
      selectedDate,
      statusFilter,
      adminProfileId: currentProfile.id,
      adminRole: currentProfile.role,
      attendanceFetchedCount: attendanceRows?.length ?? 0,
      errorCode: attendanceError?.code ?? null,
      errorMessage: attendanceError?.message ?? null
    });
  }

  const employees = (profiles ?? []) as Profile[];
  const selectedAttendance = (attendanceRows ?? []) as AttendanceRecord[];
  const assignmentsByEmployee = await fetchEmployeeDepartmentsByEmployee(supabase, [
    ...employees.map((employee) => employee.id),
    ...selectedAttendance.map((record) => record.employee_id)
  ]);
  const presentIds = new Set(selectedAttendance.map((record) => record.employee_id));
  const absentEmployees = employees.filter((employee) => !presentIds.has(employee.id));

  const filteredAttendance =
    statusFilter === "Absent"
      ? []
      : statusFilter === "All"
        ? selectedAttendance
        : selectedAttendance.filter((record) => record.status === statusFilter);

  return (
    <>
      <PageHeader title="Attendance" subtitle="View today's attendance and employee-wise attendance history." backHref="/admin/dashboard" />

      <section className="mb-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap gap-2">
          {["All", "Present", "Absent", "Late", "Half Day"].map((status) => (
            <Link
              key={status}
              href={attendanceStatusPath(status, employeeFilter, selectedDate)}
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                statusFilter === status ? "bg-bie-700 text-white" : "bg-emerald-50 text-bie-700"
              }`}
            >
              {status}
            </Link>
          ))}
        </div>
        <form className="mt-4 grid gap-2 sm:max-w-md">
          <input type="hidden" name="status" value={statusFilter} />
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Attendance date
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
            {selectedDate === today ? "Today Attendance" : "Attendance"} - {formatDate(selectedDate)}
          </h2>
          <div className="mt-4 grid gap-3">
            {statusFilter === "Absent" ? (
              absentEmployees.length ? (
                absentEmployees.map((employee) => (
                  <AttendanceEmployeeCard
                    key={employee.id}
                    name={employee.full_name}
                    department={departmentTextForProfile(employee, assignmentsByEmployee, "-")}
                    status="Absent"
                  />
                ))
              ) : (
                <EmptyState message="No absent employees today." />
              )
            ) : filteredAttendance.length ? (
              filteredAttendance.map((record) => (
                <article key={record.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-slate-950">{record.profiles?.full_name || "Employee"}</p>
                      <p className="text-sm font-medium text-slate-500">
                        {record.profiles ? departmentTextForProfile(record.profiles, assignmentsByEmployee, "-") : "-"} | {record.profiles?.designation || "-"}
                      </p>
                    </div>
                    <StatusBadge tone="attendance">{record.status}</StatusBadge>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                    <div>Date: {formatDate(record.work_date)}</div>
                    <div>Check in: {formatDateTime(record.check_in_at)}</div>
                    <div>Check out: {formatDateTime(record.check_out_at)}</div>
                    <div>Total hours: {record.total_hours ?? "-"} hrs</div>
                  </dl>
                </article>
              ))
            ) : (
              <EmptyState message="No attendance found for selected date." />
            )}
          </div>
      </section>
    </>
  );
}

function attendanceStatusPath(status: string, employee: string, date: string) {
  const params = new URLSearchParams({ status });

  if (employee) params.set("employee", employee);
  if (date) params.set("date", date);

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
