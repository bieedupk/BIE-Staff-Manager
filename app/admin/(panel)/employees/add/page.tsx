import { createEmployee } from "@/app/actions/admin";
import { EmployeeAssignmentFields } from "@/components/admin/employee-assignment-fields";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdminProfile } from "@/lib/auth";
import { ensureDefaultDepartments } from "@/lib/default-departments";
import { departmentDisplayName } from "@/lib/department-utils";
import { EMPLOYEE_TYPES } from "@/lib/employee-options";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Department, Profile } from "@/lib/types";
import { isAdminManagerRole, roleLabel } from "@/lib/utils";

const roles = ["employee", "supervisor", "admin", "super_admin"];
const statuses = ["active", "disabled"];

export default async function AddEmployeePage({
  searchParams
}: {
  searchParams?: Promise<{
    employee_success?: string;
    employee_error?: string;
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

  const supabase = canManageEmployees ? createAdminClient() : await createClient();
  const [{ data: profiles }, { data: departments }] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase
      .from("departments")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name")
  ]);

  const allEmployees = ((profiles ?? []) as Profile[]);
  const activeDepartments = (departments ?? []) as Department[];
  const supervisors = allEmployees.filter((profile) => ["super_admin", "admin", "supervisor"].includes(profile.role));
  const defaultDepartmentId = activeDepartments.find(
    (department) => departmentDisplayName(department.name) === "Administration"
  )?.id;

  return (
    <>
      <PageHeader
        title="Add Employee"
        subtitle="Create a new staff account, set login credentials, and assign role, department, designation, and supervisor."
        backHref="/admin/employees"
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

      <section className="rounded-lg border border-emerald-100 bg-white p-6 shadow-soft">
        {canManageEmployees ? (
          <form action={createEmployee} className="space-y-6">
            <input type="hidden" name="return_to" value="/admin/employees/add" />

            <div>
              <h2 className="text-base font-extrabold text-slate-950">Account Credentials & Contact</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Essential login credentials and direct contact information.</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Input name="full_name" label="Full name" placeholder="e.g. Muhammad Ali" required />
                <Input name="email" label="Email address" type="email" placeholder="name@bie.edu.pk" required />
                <Input name="password" label="Temporary password" type="password" required minLength={6} placeholder="Min 6 characters" />
                <Input name="phone" label="Phone number" placeholder="+92 300 1234567" />
              </div>
            </div>

            <div className="border-t border-emerald-100/80 pt-5">
              <h2 className="text-base font-extrabold text-slate-950">Employment & Role Information</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Define staff role, status, joining date, and supervisor hierarchy.</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Select name="employee_type" label="Employee Type" options={["", ...EMPLOYEE_TYPES]} />
                <Select name="role" label="System Role" options={roles} defaultValue="employee" />
                <Select name="status" label="Account Status" options={statuses} defaultValue="active" />
                <Input name="joining_date" label="Joining date" type="date" />
                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  Supervisor
                  <select name="supervisor_id" className="min-h-11 rounded-lg border border-slate-300 px-3 bg-white">
                    <option value="">No supervisor</option>
                    {supervisors.map((supervisor) => (
                      <option key={supervisor.id} value={supervisor.id}>
                        {supervisor.full_name} ({roleLabel(supervisor.role)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  Welcome email
                  <select name="welcome_email_mode" defaultValue="automatic" className="min-h-11 rounded-lg border border-slate-300 px-3 bg-white">
                    <option value="automatic">Send automatically</option>
                    <option value="manual">Send manually later</option>
                  </select>
                </label>
              </div>

              <div className="mt-4">
                <Textarea
                  name="responsibilities"
                  label="Responsibilities & Duties"
                  placeholder="Describe the employee's main responsibilities, recurring duties, and daily scope..."
                />
              </div>
            </div>

            <div className="border-t border-emerald-100/80 pt-5">
              <h2 className="text-base font-extrabold text-slate-950">Department & Designation Assignment</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Select one or more departments and assign primary and secondary designations.</p>
              <div className="mt-3">
                <EmployeeAssignmentFields
                  departments={activeDepartments}
                  selectedDepartmentIds={defaultDepartmentId ? [defaultDepartmentId] : []}
                />
              </div>
            </div>

            <div className="border-t border-emerald-100/80 pt-5 flex items-center justify-end gap-3">
              <a
                href="/admin/employees"
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </a>
              <SubmitButton
                pendingText="Creating employee..."
                className="min-h-11 rounded-lg bg-bie-700 px-6 font-extrabold text-white transition hover:bg-bie-800 disabled:opacity-50"
              >
                Create Employee
              </SubmitButton>
            </div>
          </form>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <h2 className="font-extrabold">Permission Restricted</h2>
            <p className="mt-1 text-sm">
              Supervisors can monitor assigned employees under View Employees. Account creation and editing is limited to admin and super admin.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700">
      {label}
      <input {...inputProps} className="min-h-11 rounded-lg border border-slate-300 px-3 bg-white" />
    </label>
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string }) {
  const { label, ...textareaProps } = props;

  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700">
      {label}
      <textarea
        rows={3}
        {...textareaProps}
        className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 bg-white"
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
      <select name={name} defaultValue={defaultValue} className="min-h-11 rounded-lg border border-slate-300 px-3 bg-white">
        {options.map((option) => (
          <option key={option} value={option}>
            {option ? roleLabel(option) : "None"}
          </option>
        ))}
      </select>
    </label>
  );
}
