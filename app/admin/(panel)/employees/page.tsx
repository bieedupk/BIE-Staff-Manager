import Link from "next/link";
import { EmployeeMoreOptions } from "@/components/admin/employee-more-options";
import { sendManualEmployeeWelcomeEmail, setEmployeeStatus, updateEmployee } from "@/app/actions/admin";
import { disableAuthorizedDevice, registerAuthorizedDevice, resetAuthorizedDevice } from "@/app/actions/devices";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdminProfile } from "@/lib/auth";
import { getAvatarSignedUrls } from "@/lib/avatar";
import { departmentDisplayName } from "@/lib/department-utils";
import { ensureDefaultDepartments } from "@/lib/default-departments";
import { departmentNamesForProfile, fetchEmployeeDepartmentsByEmployee } from "@/lib/employee-departments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AuthorizedDevice, Department, EmailLogStatus, Profile } from "@/lib/types";
import { formatDate, formatDateTime, isAdminManagerRole, roleLabel } from "@/lib/utils";

import { EmployeeAssignmentFields } from "@/components/admin/employee-assignment-fields";
import { EMPLOYEE_TYPES } from "@/lib/employee-options";

const roles = ["employee", "supervisor", "admin", "super_admin"];
const statuses = ["active", "disabled"];
const employeeFilters = ["all", "active", "disabled"] as const;
type EmployeeFilter = (typeof employeeFilters)[number];
type WelcomeEmailLog = {
  employee_id: string | null;
  status: EmailLogStatus;
  created_at: string;
};

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
  const [{ data: profiles }, { data: departments }, { data: authorizedDevices }, { data: welcomeEmailLogs }] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("departments").select("*").eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }).order("name"),
    canManageEmployees
      ? supabase.from("authorized_devices").select("*").order("registered_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    canManageEmployees
      ? supabase
          .from("email_logs")
          .select("employee_id,status,created_at")
          .eq("template_key", "employee_welcome")
          .order("created_at", { ascending: false })
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
  const [assignmentsByEmployee, avatarUrls] = await Promise.all([
    fetchEmployeeDepartmentsByEmployee(
      supabase,
      allEmployees.map((employee) => employee.id)
    ),
    getAvatarSignedUrls(allEmployees.map((employee) => employee.avatar_path))
  ]);
  const supervisors = allEmployees.filter((profile) => ["super_admin", "admin", "supervisor"].includes(profile.role));
  const devices = (authorizedDevices ?? []) as AuthorizedDevice[];
  const latestWelcomeEmailByEmployee = latestWelcomeEmailLogs((welcomeEmailLogs ?? []) as WelcomeEmailLog[]);
  const devicesByEmployee = new Map<string, AuthorizedDevice[]>();
  const defaultDepartmentId = activeDepartments.find((department) => departmentDisplayName(department.name) === "Administration")?.id;

  devices.forEach((device) => {
    const employeeDevices = devicesByEmployee.get(device.employee_id) ?? [];
    employeeDevices.push(device);
    devicesByEmployee.set(device.employee_id, employeeDevices);
  });

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="View staff accounts, filter by status, manage roles, departments, designations, supervisor, and device authorization."
        backHref="/admin/dashboard"
        action={
          canManageEmployees ? (
            <Link
              href="/admin/employees/add"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-bie-700 px-4 text-sm font-extrabold text-white shadow-soft transition hover:bg-bie-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
            >
              Add Employee
            </Link>
          ) : null
        }
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

      <section>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-6">
        {employees.length ? (
          employees.map((employee) => (
            <article key={employee.id} className="group relative flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-bie-600 hover:shadow-md">
              <div className="flex flex-1 flex-col items-center px-6 pt-8 pb-6 text-center">

                {/* Avatar with Status Dot */}
                <div className="relative mb-5">
                  <Link
                    href={`/admin/employees/${employee.id}`}
                    className="block overflow-hidden rounded-full transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700"
                    aria-label={`View profile for ${employee.full_name}`}
                  >
                    <Avatar src={avatarUrls.get(employee.avatar_path || "")} name={employee.full_name} size="xl" />
                  </Link>
                  <span
                    className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white ${
                      employee.status === "active" ? "bg-report-present" : "bg-slate-300"
                    }`}
                    title={employee.status === "active" ? "Active" : "Disabled"}
                  />
                </div>

                <Link href={`/admin/employees/${employee.id}`} className="mb-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700">
                  <h3 className="text-[17px] font-bold leading-tight text-slate-900 transition group-hover:text-bie-700">{employee.full_name}</h3>
                </Link>

                {employee.designation ? (
                  <p className="mb-2 text-sm font-medium text-slate-500">{employee.designation}</p>
                ) : null}

                <p className="mb-5 w-full truncate px-2 text-[13px] text-slate-500" title={employee.email}>
                  {departmentNamesForProfile(employee, assignmentsByEmployee)[0] || employee.email}
                </p>

                {/* Tags / Pills */}
                <div className="mt-auto flex flex-wrap justify-center gap-2">
                   <span className="rounded-full bg-bie-50 px-3 py-1 text-[11px] font-bold text-bie-700">
                     {roleLabel(employee.role)}
                   </span>
                   {employee.employee_type ? (
                     <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
                       {employee.employee_type}
                     </span>
                   ) : null}
                </div>
              </div>

              {/* Action Footer */}
              <div className="flex shrink-0 items-center justify-center gap-3 border-t border-slate-100 bg-slate-50/50 p-4">
                 <Link href={`/admin/employees/${employee.id}`} aria-label={`View profile for ${employee.full_name}`} title="View Profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm transition hover:bg-bie-50 hover:text-bie-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700">
                   <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                 </Link>
                 <Link href={`/admin/employees/${employee.id}/attendance`} aria-label={`View attendance for ${employee.full_name}`} title="Attendance" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm transition hover:bg-bie-50 hover:text-bie-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700">
                   <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                 </Link>
                 <Link href={`/admin/employees/${employee.id}/reports`} aria-label={`View reports for ${employee.full_name}`} title="Reports" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm transition hover:bg-bie-50 hover:text-bie-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700">
                   <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                 </Link>
              </div>

              {canManageEmployees ? (
                <EmployeeMoreOptions>
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="mb-1 text-xs font-bold text-slate-500 uppercase">Profile Status</p>
                      <div className="flex gap-2">
                        {employee.welcome_email_mode === "manual" && ["pending", "failed", "skipped"].includes(employee.welcome_email_status) ? (
                          <form action={sendManualEmployeeWelcomeEmail} className="flex-1">
                            <input type="hidden" name="id" value={employee.id} />
                            <SubmitButton pendingText="Sending..." className="w-full rounded-lg bg-bie-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-bie-800 disabled:opacity-50">
                              Send Email
                            </SubmitButton>
                          </form>
                        ) : null}
                        <form action={setEmployeeStatus} className="flex-1">
                          <input type="hidden" name="id" value={employee.id} />
                          <input type="hidden" name="status" value={employee.status === "active" ? "disabled" : "active"} />
                          <SubmitButton pendingText="..." className={`w-full rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${employee.status === "active" ? "border-red-200 text-red-700 hover:bg-red-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                            {employee.status === "active" ? "Disable Profile" : "Enable Profile"}
                          </SubmitButton>
                        </form>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-sm font-semibold text-slate-700">Welcome Email</span>
                      <WelcomeEmailStatus employee={employee} log={latestWelcomeEmailByEmployee.get(employee.id)} />
                    </div>

                    {employee.role === "employee" ? (
                      <div className="mt-1 border-t border-slate-100 pt-3">
                        <AuthorizedDevicePanel devices={devicesByEmployee.get(employee.id) ?? []} employeeId={employee.id} />
                      </div>
                    ) : null}
                  </div>
                </EmployeeMoreOptions>
              ) : null}
            </article>
          ))
        ) : (
          <EmptyState message={statusFilter === "all" ? "No employee profiles found." : `No ${statusFilter} employee profiles found.`} />
        )}
        </div>
      </section>
    </>
  );
}

function selectedDepartmentIds(
  employee: Profile,
  departments: Department[],
  assignmentsByEmployee: Map<string, import("@/lib/types").EmployeeDepartment[]>
) {
  const assignedDepartmentIds = (assignmentsByEmployee.get(employee.id) ?? []).map((assignment) => assignment.department_id);
  if (assignedDepartmentIds.length) return assignedDepartmentIds;
  if (employee.department_id) return [employee.department_id];

  const matchingDepartment = departments.find((department) => departmentDisplayName(department.name) === departmentDisplayName(employee.department));
  if (matchingDepartment) return [matchingDepartment.id];

  const otherDepartment = departments.find((department) => departmentDisplayName(department.name) === "Other");
  return otherDepartment ? [otherDepartment.id] : [];
}

function selectedOtherDepartment(employee: Profile, assignmentsByEmployee: Map<string, import("@/lib/types").EmployeeDepartment[]>) {
  const otherAssignment = (assignmentsByEmployee.get(employee.id) ?? []).find(
    (assignment) => departmentDisplayName(assignmentDepartmentName(assignment)) === "Other"
  );

  if (otherAssignment?.other_department) return otherAssignment.other_department;
  if (employee.department && employee.department !== "Other") return employee.department;
  return "";
}

function assignmentDepartmentName(assignment: import("@/lib/types").EmployeeDepartment) {
  const department = Array.isArray(assignment.departments) ? assignment.departments[0] : assignment.departments;
  return department?.name;
}

function latestWelcomeEmailLogs(logs: WelcomeEmailLog[]) {
  const latestLogs = new Map<string, WelcomeEmailLog>();

  logs.forEach((log) => {
    if (log.employee_id && !latestLogs.has(log.employee_id)) {
      latestLogs.set(log.employee_id, log);
    }
  });

  return latestLogs;
}

function WelcomeEmailStatus({ employee, log }: { employee?: Pick<Profile, "welcome_email_mode" | "welcome_email_status">; log?: WelcomeEmailLog }) {
  const profileStatus = employee?.welcome_email_status;
  const status = profileStatus ?? (log ? log.status : "pending");
  const label = welcomeEmailStatusLabel(status);
  const className = welcomeEmailStatusClass(status);

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${className}`}>
      Welcome email: {label}
    </span>
  );
}

function welcomeEmailStatusLabel(status: EmailLogStatus | "pending" | "sending") {
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  if (status === "sending") return "Sending";
  return "Pending";
}

function welcomeEmailStatusClass(status: EmailLogStatus | "pending" | "sending") {
  if (status === "sent") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "failed") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "skipped") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "sending") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
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
              <SubmitButton pendingText="Disabling..." className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50">
                Disable device
              </SubmitButton>
            </form>
            <form action={resetAuthorizedDevice}>
              <input type="hidden" name="employee_id" value={employeeId} />
              <SubmitButton pendingText="Resetting..." className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-bie-700 transition hover:bg-emerald-50 disabled:opacity-50">
                Reset device
              </SubmitButton>
            </form>
          </>
        ) : (
          <form action={registerAuthorizedDevice}>
            <input type="hidden" name="employee_id" value={employeeId} />
            <SubmitButton pendingText="Registering..." className="rounded-lg bg-bie-700 px-3 py-2 text-sm font-extrabold text-white transition hover:bg-bie-800 disabled:opacity-50">
              Register this device
            </SubmitButton>
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

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string }) {
  const { label, ...textareaProps } = props;

  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700 md:col-span-2 xl:col-span-2">
      {label}
      <textarea
        {...textareaProps}
        className="min-h-11 rounded-lg border border-slate-300 px-3 py-2"
      />
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
