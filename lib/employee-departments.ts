import "server-only";

import { departmentDisplayName } from "@/lib/department-utils";
import type { Department, EmployeeDepartment, Profile } from "@/lib/types";

type SupabaseLike = {
  from: (table: string) => any;
};

export function otherDepartmentName(assignment: EmployeeDepartment) {
  const departmentName = departmentDisplayName(assignment.departments?.name);
  if (departmentName === "Other" && assignment.other_department?.trim()) {
    return assignment.other_department.trim();
  }

  return departmentName;
}

export function departmentNamesForProfile(
  profile: Pick<Profile, "id" | "department">,
  assignmentsByEmployee: Map<string, EmployeeDepartment[]>
) {
  const assignedNames = (assignmentsByEmployee.get(profile.id) ?? [])
    .map(otherDepartmentName)
    .filter((name): name is string => Boolean(name));

  if (assignedNames.length) {
    return [...new Set(assignedNames)];
  }

  const fallbackName = departmentDisplayName(profile.department);
  return fallbackName ? [fallbackName] : [];
}

export function departmentTextForProfile(
  profile: Pick<Profile, "id" | "department">,
  assignmentsByEmployee: Map<string, EmployeeDepartment[]>,
  fallback = "Not assigned"
) {
  const names = departmentNamesForProfile(profile, assignmentsByEmployee);
  return names.length ? names.join(", ") : fallback;
}

export async function fetchEmployeeDepartmentsByEmployee(supabase: SupabaseLike, employeeIds: string[]) {
  const assignmentsByEmployee = new Map<string, EmployeeDepartment[]>();
  const uniqueEmployeeIds = [...new Set(employeeIds)].filter(Boolean);

  if (!uniqueEmployeeIds.length) {
    return assignmentsByEmployee;
  }

  const { data, error } = await supabase
    .from("employee_departments")
    .select("employee_id, department_id, other_department, is_primary, created_at, departments(id, name, is_active, sort_order, created_at)")
    .in("employee_id", uniqueEmployeeIds);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[employee-departments] falling back to profile.department", {
        code: error.code ?? null,
        message: error.message
      });
    }
    return assignmentsByEmployee;
  }

  ((data ?? []) as EmployeeDepartment[]).forEach((assignment) => {
    const employeeAssignments = assignmentsByEmployee.get(assignment.employee_id) ?? [];
    employeeAssignments.push(assignment);
    assignmentsByEmployee.set(assignment.employee_id, employeeAssignments);
  });

  assignmentsByEmployee.forEach((employeeAssignments) => {
    employeeAssignments.sort((first, second) => {
      if (first.is_primary !== second.is_primary) return first.is_primary ? -1 : 1;
      if (first.departments?.sort_order !== second.departments?.sort_order) {
        if (first.departments?.sort_order === null || first.departments?.sort_order === undefined) return 1;
        if (second.departments?.sort_order === null || second.departments?.sort_order === undefined) return -1;
        return first.departments.sort_order - second.departments.sort_order;
      }
      return otherDepartmentName(first).localeCompare(otherDepartmentName(second), "en");
    });
  });

  return assignmentsByEmployee;
}
