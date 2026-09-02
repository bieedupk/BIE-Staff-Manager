import { EmployeeAssignmentFields } from "@/components/admin/employee-assignment-fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { EMPLOYEE_TYPES } from "@/lib/employee-options";
import type { Department, Profile } from "@/lib/types";
import { formatDate, roleLabel } from "@/lib/utils";
import { updateEmployee } from "@/app/actions/admin";
import { departmentDisplayName } from "@/lib/department-utils";

const roles = ["employee", "supervisor", "admin", "super_admin"];
const statuses = ["active", "disabled"];

export function EditEmployeeForm({
  employee,
  activeDepartments,
  assignmentsByEmployee,
  supervisors
}: {
  employee: Profile;
  activeDepartments: Department[];
  assignmentsByEmployee: Map<string, import("@/lib/types").EmployeeDepartment[]>;
  supervisors: Pick<Profile, "id" | "full_name">[];
}) {
  return (
    <form action={updateEmployee} className="grid gap-6 md:grid-cols-2">
      <input type="hidden" name="id" value={employee.id} />

      <Input name="full_name" label="Full name" defaultValue={employee.full_name} required />
      <Input name="phone" label="Phone" defaultValue={employee.phone ?? ""} />

      <Select name="employee_type" label="Employee Type" options={["", ...EMPLOYEE_TYPES]} defaultValue={employee.employee_type ?? ""} />
      <Input name="joining_date" label="Joining date" type="date" defaultValue={employee.joining_date ?? ""} />

      <Select name="role" label="Role" options={roles} defaultValue={employee.role} />
      <Select name="status" label="Status" options={statuses} defaultValue={employee.status} />

      <Textarea
        name="responsibilities"
        label="Responsibilities"
        defaultValue={employee.responsibilities ?? ""}
        placeholder="Responsibilities and duties"
      />

      <div className="md:col-span-2">
        <EmployeeAssignmentFields
          departments={activeDepartments}
          selectedDepartmentIds={selectedDepartmentIds(employee, activeDepartments, assignmentsByEmployee)}
          otherDepartment={selectedOtherDepartment(employee, assignmentsByEmployee)}
          defaultDesignation={employee.designation ?? ""}
        />
      </div>

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

      <div className="md:col-span-2 mt-2 flex flex-col gap-3 border-t border-emerald-100 pt-5 sm:flex-row sm:justify-end">
        <p className="mr-auto self-center text-xs font-medium text-slate-500">Joined: {formatDate(employee.joining_date)}</p>
        <a
          href={`/admin/employees/${employee.id}`}
          className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-center font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700"
        >
          Cancel
        </a>
        <SubmitButton pendingText="Saving..." className="rounded-lg bg-bie-700 px-6 py-2.5 font-extrabold text-white transition hover:bg-bie-800 disabled:opacity-50">
          Save changes
        </SubmitButton>
      </div>
    </form>
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
    <label className="grid gap-1 text-sm font-bold text-slate-700 md:col-span-2">
      {label}
      <textarea
        {...textareaProps}
        className="min-h-24 rounded-lg border border-slate-300 px-3 py-2"
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