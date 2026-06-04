"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/app/actions/audit";
import { requireAdminProfile } from "@/lib/auth";
import { departmentDisplayName } from "@/lib/department-utils";
import { ensureDefaultDepartments } from "@/lib/default-departments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Department, EmployeeStatus, Profile, UserRole } from "@/lib/types";

function requireAdminManager(role: UserRole) {
  if (role !== "super_admin" && role !== "admin") {
    throw new Error("Only admin and super admin can manage employees.");
  }
}

function requireAssignableRole(currentRole: UserRole, nextRole: UserRole) {
  if (nextRole === "super_admin" && currentRole !== "super_admin") {
    throw new Error("Only super admin can assign the super admin role.");
  }
}

function redirectEmployeeStatus(type: "success" | "error", message: string) {
  redirect(`/admin/employees?employee_${type}=${encodeURIComponent(message)}`);
}

function normalizeRole(value: string): UserRole {
  if (value === "super_admin" || value === "admin" || value === "supervisor" || value === "employee") {
    return value;
  }

  throw new Error("Please select a valid role.");
}

function normalizeEmployeeStatus(value: string): EmployeeStatus {
  if (value === "active" || value === "disabled") {
    return value;
  }

  throw new Error("Please select a valid status.");
}

function selectedDepartmentIds(formData: FormData) {
  return [...new Set(formData.getAll("department_ids").map((value) => String(value)).filter(Boolean))];
}

async function resolveDepartmentSelection(formData: FormData) {
  const departmentIds = selectedDepartmentIds(formData);
  if (!departmentIds.length) throw new Error("Please select at least one department.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("departments")
    .select("*")
    .eq("is_active", true)
    .in("id", departmentIds);

  if (error) throw new Error(error.message);

  const departments = (data ?? []) as Department[];
  if (departments.length !== departmentIds.length) {
    throw new Error("One or more selected departments were not found. Please refresh and try again.");
  }

  const departmentsById = new Map(departments.map((department) => [department.id, department]));
  const orderedDepartments = departmentIds.map((id) => departmentsById.get(id)).filter((department): department is Department => Boolean(department));
  const otherDepartment = orderedDepartments.find((department) => departmentDisplayName(department.name) === "Other");
  const otherDepartmentText = String(formData.get("other_department") || "").trim();

  if (otherDepartment && !otherDepartmentText) {
    throw new Error("Write department name is required when Other is selected.");
  }

  return {
    departments: orderedDepartments,
    primaryDepartment: orderedDepartments[0],
    otherDepartmentText: otherDepartment ? otherDepartmentText : null
  };
}

async function replaceEmployeeDepartments(employeeId: string, departments: Department[], otherDepartmentText: string | null) {
  const admin = createAdminClient();
  const { error: deleteError } = await admin.from("employee_departments").delete().eq("employee_id", employeeId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await admin.from("employee_departments").insert(
    departments.map((department, index) => ({
      employee_id: employeeId,
      department_id: department.id,
      other_department: departmentDisplayName(department.name) === "Other" ? otherDepartmentText : null,
      is_primary: index === 0
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function createEmployee(formData: FormData) {
  const currentProfile = await requireAdminProfile();
  let authUserId: string | null = null;
  let success = false;
  let errorMessage = "Employee could not be created.";

  try {
    requireAdminManager(currentProfile.role);

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const fullName = String(formData.get("full_name") || "").trim();
    const role = normalizeRole(String(formData.get("role") || "employee"));
    const status = normalizeEmployeeStatus(String(formData.get("status") || "active"));
    const supervisorId = String(formData.get("supervisor_id") || "") || null;

    requireAssignableRole(currentProfile.role, role);

    if (!fullName) throw new Error("Full name is required.");
    if (!email) throw new Error("Email is required.");
    if (password.length < 6) throw new Error("Temporary password must be at least 6 characters.");
    await ensureDefaultDepartments();
    const { departments, primaryDepartment, otherDepartmentText } = await resolveDepartmentSelection(formData);
    const admin = createAdminClient();

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message || "Could not create employee auth account.");
    }

    authUserId = authData.user.id;

    const { error: profileError } = await admin.from("profiles").insert({
      id: authData.user.id,
      full_name: fullName,
      email,
      phone: String(formData.get("phone") || "").trim() || null,
      role,
      department: departmentDisplayName(primaryDepartment.name),
      department_id: primaryDepartment.id,
      designation: String(formData.get("designation") || "").trim() || null,
      supervisor_id: supervisorId,
      joining_date: String(formData.get("joining_date") || "") || null,
      status
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      authUserId = null;
      throw new Error(profileError.message);
    }

    await replaceEmployeeDepartments(authData.user.id, departments, otherDepartmentText);

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: currentProfile.id,
      action: "employee_created",
      entity_type: "profiles",
      entity_id: authData.user.id,
      details: { email, role }
    });

    if (auditError) {
      throw new Error(`Employee was created but audit log failed: ${auditError.message}`);
    }

    revalidatePath("/admin/employees");
    revalidatePath("/admin/dashboard");
    success = true;
  } catch (error) {
    if (authUserId) {
      await createAdminClient().auth.admin.deleteUser(authUserId);
    }

    errorMessage = error instanceof Error ? error.message : errorMessage;
  }

  redirectEmployeeStatus(success ? "success" : "error", success ? "Employee created successfully." : errorMessage);
}

export async function updateEmployee(formData: FormData) {
  const currentProfile = await requireAdminProfile();
  let success = false;
  let errorMessage = "Employee could not be updated.";

  try {
    requireAdminManager(currentProfile.role);

    const id = String(formData.get("id"));
    const role = normalizeRole(String(formData.get("role") || "employee"));
    const status = normalizeEmployeeStatus(String(formData.get("status") || "active"));
    requireAssignableRole(currentProfile.role, role);
    await ensureDefaultDepartments();
    const { departments, primaryDepartment, otherDepartmentText } = await resolveDepartmentSelection(formData);

    const admin = createAdminClient();
    const { data: existingProfile, error: existingError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single<Profile>();

    if (existingError || !existingProfile) {
      throw new Error("Employee profile was not found.");
    }

    if (existingProfile.id === currentProfile.id && status === "disabled") {
      throw new Error("You cannot disable your own active admin account.");
    }

    if (existingProfile.role === "super_admin" && currentProfile.role !== "super_admin") {
      throw new Error("Only super admin can update a super admin account.");
    }

    const { error } = await admin
      .from("profiles")
      .update({
        full_name: String(formData.get("full_name") || "").trim(),
        phone: String(formData.get("phone") || "").trim() || null,
        role,
        department: departmentDisplayName(primaryDepartment.name),
        department_id: primaryDepartment.id,
        designation: String(formData.get("designation") || "").trim() || null,
        supervisor_id: String(formData.get("supervisor_id") || "") || null,
        joining_date: String(formData.get("joining_date") || "") || null,
        status
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    await replaceEmployeeDepartments(id, departments, otherDepartmentText);

    const statusChanged = existingProfile.status !== status;
    const auditAction = statusChanged
      ? status === "disabled"
        ? "employee_disabled"
        : "employee_enabled"
      : "employee_edited";

    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: currentProfile.id,
      action: auditAction,
      entity_type: "profiles",
      entity_id: id,
      details: { role, status }
    });

    if (auditError) throw new Error(auditError.message);

    revalidatePath("/admin/employees");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/audit-logs");
    success = true;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : errorMessage;
  }

  redirectEmployeeStatus(success ? "success" : "error", success ? "Employee updated successfully." : errorMessage);
}

export async function setEmployeeStatus(formData: FormData) {
  const currentProfile = await requireAdminProfile();
  let success = false;
  let errorMessage = "Employee status could not be updated.";

  try {
    requireAdminManager(currentProfile.role);
    const id = String(formData.get("id"));
    const status = normalizeEmployeeStatus(String(formData.get("status") || ""));
    const admin = createAdminClient();

    const { data: employee, error: employeeError } = await admin
      .from("profiles")
      .select("id, role, status")
      .eq("id", id)
      .single<Pick<Profile, "id" | "role" | "status">>();

    if (employeeError || !employee) {
      throw new Error("Employee profile was not found.");
    }

    if (id === currentProfile.id && status === "disabled") {
      throw new Error("You cannot disable your own active admin account.");
    }

    if (employee.role === "super_admin" && currentProfile.role !== "super_admin") {
      throw new Error("Only super admin can change a super admin account status.");
    }

    if (employee.status !== status) {
      const { error } = await admin.from("profiles").update({ status }).eq("id", id);
      if (error) throw new Error(error.message);

      const { error: auditError } = await admin.from("audit_logs").insert({
        actor_id: currentProfile.id,
        action: status === "disabled" ? "employee_disabled" : "employee_enabled",
        entity_type: "profiles",
        entity_id: id,
        details: { status }
      });

      if (auditError) throw new Error(auditError.message);
    }

    revalidatePath("/admin/employees");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/audit-logs");
    success = true;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : errorMessage;
  }

  redirectEmployeeStatus(success ? "success" : "error", success ? "Employee status updated successfully." : errorMessage);
}

export async function createDepartment(formData: FormData) {
  const currentProfile = await requireAdminProfile();
  requireAdminManager(currentProfile.role);

  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({
    name: String(formData.get("name") || "").trim()
  });
  if (error) throw new Error(error.message);

  await logAudit("department created", "departments", null, { name: formData.get("name") });
  revalidatePath("/admin/departments");
}

export async function updateDepartment(formData: FormData) {
  const currentProfile = await requireAdminProfile();
  requireAdminManager(currentProfile.role);

  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({
      name: String(formData.get("name") || "").trim(),
      is_active: formData.get("is_active") === "on"
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logAudit("department edited", "departments", id);
  revalidatePath("/admin/departments");
}
