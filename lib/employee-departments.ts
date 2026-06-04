import "server-only";

import { departmentDisplayName } from "@/lib/department-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Department, EmployeeDepartment, Profile } from "@/lib/types";

type SupabaseLike = {
  from: (table: string) => any;
};

type AssignmentDepartment = Pick<Department, "name" | "sort_order" | "is_active">;

type DepartmentAssignment = Pick<
  EmployeeDepartment,
  "employee_id" | "department_id" | "other_department" | "is_primary" | "created_at"
> & {
  departments?: AssignmentDepartment | AssignmentDepartment[] | null;
};

function assignmentDepartment(assignment: DepartmentAssignment) {
  return Array.isArray(assignment.departments) ? assignment.departments[0] : assignment.departments;
}

export function otherDepartmentName(assignment: DepartmentAssignment) {
  const departmentName = departmentDisplayName(assignmentDepartment(assignment)?.name);
  if (departmentName === "Other" && assignment.other_department?.trim()) {
    return assignment.other_department.trim();
  }

  return departmentName;
}

function sortAssignments(first: DepartmentAssignment, second: DepartmentAssignment) {
  if (first.is_primary !== second.is_primary) return first.is_primary ? -1 : 1;

  const firstDepartment = assignmentDepartment(first);
  const secondDepartment = assignmentDepartment(second);

  if (firstDepartment?.sort_order !== secondDepartment?.sort_order) {
    if (firstDepartment?.sort_order === null || firstDepartment?.sort_order === undefined) return 1;
    if (secondDepartment?.sort_order === null || secondDepartment?.sort_order === undefined) return -1;
    return firstDepartment.sort_order - secondDepartment.sort_order;
  }

  return otherDepartmentName(first).localeCompare(otherDepartmentName(second), "en");
}

function assignmentNames(assignments: DepartmentAssignment[]) {
  return [
    ...new Set(
      assignments
        .sort(sortAssignments)
        .map(otherDepartmentName)
        .filter((name): name is string => Boolean(name))
    )
  ];
}

async function fetchAssignmentsForEmployee(supabase: SupabaseLike, employeeId: string) {
  const { data, error } = await supabase
    .from("employee_departments")
    .select("employee_id, department_id, other_department, is_primary, created_at, departments(name, sort_order, is_active)")
    .eq("employee_id", employeeId);

  return {
    assignments: ((data ?? []) as DepartmentAssignment[]).filter((assignment) => assignment.employee_id === employeeId),
    error
  };
}

export async function getEmployeeDepartmentNames(employeeId: string, fallbackDepartment?: string | null) {
  if (!employeeId) {
    if (process.env.NODE_ENV !== "production") {
      console.log({ employeeId, departmentCount: 0, departmentNames: [], error: "Missing employee id" });
    }
    const fallbackName = departmentDisplayName(fallbackDepartment);
    return fallbackName ? [fallbackName] : [];
  }

  const supabase = await createClient();
  const sessionResult = await fetchAssignmentsForEmployee(supabase, employeeId);
  let names = assignmentNames(sessionResult.assignments);

  if (process.env.NODE_ENV !== "production") {
    console.log({
      employeeId,
      departmentCount: names.length,
      departmentNames: names,
      error: sessionResult.error?.message ?? null
    });
  }

  if (!names.length) {
    try {
      const adminResult = await fetchAssignmentsForEmployee(createAdminClient(), employeeId);
      names = assignmentNames(adminResult.assignments);

      if (process.env.NODE_ENV !== "production") {
        console.log({
          employeeId,
          departmentCount: names.length,
          departmentNames: names,
          error: adminResult.error?.message ?? null
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.log({
          employeeId,
          departmentCount: 0,
          departmentNames: [],
          error: error instanceof Error ? error.message : "Admin department lookup failed"
        });
      }
    }
  }

  if (names.length) return names;

  const fallbackName = departmentDisplayName(fallbackDepartment);
  return fallbackName ? [fallbackName] : [];
}

export async function getEmployeeDepartmentText(employeeId: string, fallbackDepartment?: string | null, fallback = "Not assigned") {
  const names = await getEmployeeDepartmentNames(employeeId, fallbackDepartment);
  return names.length ? names.join(", ") : fallback;
}

export function departmentNamesForProfile(
  profile: Pick<Profile, "id" | "department">,
  assignmentsByEmployee: Map<string, EmployeeDepartment[]>
) {
  const assignedNames = assignmentNames(assignmentsByEmployee.get(profile.id) ?? []);

  if (assignedNames.length) {
    return assignedNames;
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
    .select("employee_id, department_id, other_department, is_primary, created_at, departments(name, sort_order, is_active)")
    .in("employee_id", uniqueEmployeeIds);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.log({
        employeeId: uniqueEmployeeIds.join(","),
        departmentCount: 0,
        departmentNames: [],
        error: error.message
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
    employeeAssignments.sort(sortAssignments);
  });

  return assignmentsByEmployee;
}

export async function fetchEmployeeDepartmentNames(supabase: SupabaseLike, profile: Pick<Profile, "id" | "department">) {
  const assignmentsByEmployee = await fetchEmployeeDepartmentsByEmployee(supabase, [profile.id]);
  return departmentNamesForProfile(profile, assignmentsByEmployee);
}

export async function fetchEmployeeDepartmentText(
  supabase: SupabaseLike,
  profile: Pick<Profile, "id" | "department">,
  fallback = "Not assigned"
) {
  const names = await fetchEmployeeDepartmentNames(supabase, profile);
  return names.length ? names.join(", ") : fallback;
}
