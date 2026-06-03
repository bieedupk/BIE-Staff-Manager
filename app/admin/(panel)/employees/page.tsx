import { createEmployee, setEmployeeStatus, updateEmployee } from "@/app/actions/admin";
import { disableAuthorizedDevice, registerAuthorizedDevice, resetAuthorizedDevice } from "@/app/actions/devices";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth";
import { ensureDefaultDepartments } from "@/lib/default-departments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AuthorizedDevice, Department, Profile } from "@/lib/types";
import { formatDate, formatDateTime, isAdminManagerRole, roleLabel } from "@/lib/utils";

const roles = ["employee", "supervisor", "admin", "super_admin"];
const statuses = ["active", "disabled"];
const employeeFilters = ["all", "active", "disabled"] as const;
type EmployeeFilter = (typeof employeeFilters)[number];

function employeeSortValue(profile: Profile) {
  return `${profile.status === "active" ? "0" : "1"}-${profile.full_name.toLocaleLowerCase("en")}`;
}

function filterLabel(filter: EmployeeFilter) {
  if (filter === "active") return "Active";
  if (filter === "disabled") return "Disabled";
  return "All";
}

export default async function AdminEmployeesPage({
  searchParams
}: {
  searchParams?: Promise<{
    employee_success?: string;
    employee_error?: string;
    status_filter?: string;
  }>;
}) {
  const currentProfile = await requireAdminProfile();
  const canManageEmployees = isAdminManagerRole(currentProfile.role);

  if (canManageEmployees) {
    await ensureDefaultDepartments();
  }

  const resolvedSearchParams = await searchParams;
  const successMessage = resolvedSearchParams?.employee_success;
  const errorMessage = resolvedSearchParams?.employee_error;
  const statusFilter = employeeFilters.includes(resolvedSearchParams?.status_filter as EmployeeFilter)
    ? (resolvedSearchParams?.status_filter as EmployeeFilter)
    : "all";
  const supabase = canManageEmployees ? createAdminClient() : await createClient();
  const [{ data: profiles }, { data: departments }, { data: authorizedDevices }] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("departments").select("*").eq("is_active", true).order("name"),
    canManageEmployees
      ? supabase.from("authorized_devices").select("*").order("registered_at", { ascending: false })
      : Promise.resolve({ data: [] })
  ]);

  const allEmployees = (canManageEmployees
    ? ((profiles ?? []) as Profile[])
    : ((profiles ?? []) as Profile[]).filter((profile) => profile.id !== currentProfile.id)
  ).sort((first, second) => employeeSortValue(first).localeCompare(employeeSortValue(second)));
  const activeEmployeeCount = allEmployees.filter((profile) => profile.status === "active").length;
  const disabledEmployeeCount = allEmployees.filter((profile) => profile.status === "disabled").length;
  const employees = allEmployees.filter((profile) => statusFilter === "all" || profile.status === statusFilter);
  const activeDepartments = (departments ?? []) as Department[];
  const supervisors = allEmployees.filter((profile) => ["super_admin", "admin", "supervisor"].includes(profile.role));
  const devices = (authorizedDevices ?? []) as AuthorizedDevice[];
  const devicesByEmployee = new Map<string, AuthorizedDevice[]>();

  devices.forEach((device) => {
    const employeeDevices = devicesByEmployee.get(device.employee_id) ?? [];
    employeeDevices.push(device);
    devicesByEmployee.set(device.employee_id, employeeDevices);
  });

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Add staff accounts, assign role, department, designation, supervisor, and disable inactive accounts."
        backHref="/admin/dashboard"
      />

      {successMessage ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          {successMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">Add Employee</h2>
        {canManageEmployees ? (
        <form action={createEmployee} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input name="full_name" label="Full name" required />
          <Input name="email" label="Email" type="email" required />
          <Input name="password" label="Temporary password" type="password" required minLength={6} />
          <Input name="phone" label="Phone" />
          <Input name="designation" label="Designation" />
          <Input name="joining_date" label="Joining date" type="date" />
          <Select name="role" label="Role" options={roles} />
          <Select name="status" label="Status" options={statuses} />
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Department
            <select name="department" required defaultValue="Administration" className="min-h-11 rounded-lg border border-slate-300 px-3">
              {activeDepartments.map((department) => (
                <option key={department.id} value={department.name}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Supervisor
            <select name="supervisor_id" className="min-h-11 rounded-lg border border-slate-300 px-3">
              <option value="">No supervisor</option>
              {supervisors.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.full_name}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2 xl:col-span-3">
            <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Create employee</button>
          </div>
        </form>
        ) : (
          <p className="mt-2 text-sm font-medium text-slate-500">
            Supervisors can monitor assigned employees here. Account creation and editing is limited to admin and super admin.
          </p>
        )}
      </section>

      <section className="mt-5">
        <div className="mb-4 flex flex-wrap gap-2">
          {employeeFilters.map((filter) => {
            const count = filter === "active" ? activeEmployeeCount : filter === "disabled" ? disabledEmployeeCount : allEmployees.length;

            return (
              <a
                key={filter}
                href={`/admin/employees?status_filter=${filter}`}
                className={`rounded-lg px-3 py-2 text-sm font-extrabold ${
                  statusFilter === filter ? "bg-bie-700 text-white" : "bg-emerald-50 text-bie-700"
                }`}
              >
                {filterLabel(filter)} ({count})
              </a>
            );
          })}
        </div>
        <div className="grid gap-4">
        {employees.length ? (
          employees.map((employee) => (
            <article key={employee.id} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-950">{employee.full_name}</h3>
                  <p className="text-sm font-medium text-slate-500">{employee.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge>{roleLabel(employee.role)}</StatusBadge>
                    <StatusBadge tone="employee">{roleLabel(employee.status)}</StatusBadge>
                    <StatusBadge>{employee.department || "Other"}</StatusBadge>
                  </div>
                </div>
                {canManageEmployees ? (
                  <form action={setEmployeeStatus}>
                    <input type="hidden" name="id" value={employee.id} />
                    <input type="hidden" name="status" value={employee.status === "active" ? "disabled" : "active"} />
                    <button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700">
                      {employee.status === "active" ? "Disable" : "Enable"}
                    </button>
                  </form>
                ) : null}
              </div>
              {canManageEmployees && employee.role === "employee" ? (
                <AuthorizedDevicePanel devices={devicesByEmployee.get(employee.id) ?? []} employeeId={employee.id} />
              ) : null}
              {canManageEmployees ? (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-extrabold text-bie-700">Edit employee</summary>
                <form action={updateEmployee} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <input type="hidden" name="id" value={employee.id} />
                  <Input name="full_name" label="Full name" defaultValue={employee.full_name} required />
                  <Input name="phone" label="Phone" defaultValue={employee.phone ?? ""} />
                  <Input name="designation" label="Designation" defaultValue={employee.designation ?? ""} />
                  <Input name="joining_date" label="Joining date" type="date" defaultValue={employee.joining_date ?? ""} />
                  <Select name="role" label="Role" options={roles} defaultValue={employee.role} />
                  <Select name="status" label="Status" options={statuses} defaultValue={employee.status} />
                  <label className="grid gap-1 text-sm font-bold text-slate-700">
                    Department
                    <select name="department" defaultValue={employee.department || "Other"} className="min-h-11 rounded-lg border border-slate-300 px-3">
                      {activeDepartments.map((department) => (
                        <option key={department.id} value={department.name}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-700">
                    Supervisor
                    <select name="supervisor_id" defaultValue={employee.supervisor_id ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3">
                      <option value="">No supervisor</option>
                      {supervisors
                        .filter((supervisor) => supervisor.id !== employee.id)
                        .map((supervisor) => (
                          <option key={supervisor.id} value={supervisor.id}>
                            {supervisor.full_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <input name="department_id" type="hidden" value="" />
                  <p className="text-sm font-medium text-slate-500">Joined: {formatDate(employee.joining_date)}</p>
                  <div className="md:col-span-2 xl:col-span-3">
                    <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Save changes</button>
                  </div>
                </form>
              </details>
              ) : null}
            </article>
          ))
        ) : (
          <EmptyState message={statusFilter === "all" ? "No employee profiles found. Create your first staff account above." : `No ${statusFilter} employee profiles found.`} />
        )}
        </div>
      </section>
    </>
  );
}

function AuthorizedDevicePanel({ devices, employeeId }: { devices: AuthorizedDevice[]; employeeId: string }) {
  const activeDevice = devices.find((device) => device.status === "active");
  const hasDisabledDevice = devices.some((device) => device.status === "disabled");
  const statusLabel = activeDevice ? "Active" : hasDisabledDevice ? "Disabled" : "Not registered";

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-extrabold text-slate-950">Authorized Device</p>
          <p className="text-sm font-medium text-slate-600">
            {activeDevice ? activeDevice.device_name : "No active authorized office computer."}
          </p>
          {activeDevice?.last_used_at ? (
            <p className="mt-1 text-xs font-medium text-slate-500">Last used: {formatDateTime(activeDevice.last_used_at)}</p>
          ) : null}
        </div>
        <StatusBadge tone={activeDevice ? "employee" : "neutral"}>{statusLabel}</StatusBadge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {activeDevice ? (
          <>
            <form action={disableAuthorizedDevice}>
              <input type="hidden" name="employee_id" value={employeeId} />
              <button className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700">
                Disable device
              </button>
            </form>
            <form action={resetAuthorizedDevice}>
              <input type="hidden" name="employee_id" value={employeeId} />
              <button className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-bie-700">
                Reset device
              </button>
            </form>
          </>
        ) : (
          <form action={registerAuthorizedDevice}>
            <input type="hidden" name="employee_id" value={employeeId} />
            <button className="rounded-lg bg-bie-700 px-3 py-2 text-sm font-extrabold text-white">
              Register this device
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700">
      {label}
      <input {...inputProps} className="min-h-11 rounded-lg border border-slate-300 px-3" />
    </label>
  );
}

function Select({
  label,
  name,
  options,
  defaultValue
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700">
      {label}
      <select name={name} defaultValue={defaultValue} className="min-h-11 rounded-lg border border-slate-300 px-3">
        {options.map((option) => (
          <option key={option} value={option}>
            {roleLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
