"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/app/actions/audit";
import { requireAdminProfile } from "@/lib/auth";
import { departmentDisplayName } from "@/lib/department-utils";
import { ensureDefaultDepartments } from "@/lib/default-departments";
import { sendEmployeeWelcomeEmail } from "@/lib/email/employee-welcome";
import { fetchEmployeeDepartmentsByEmployee } from "@/lib/employee-departments";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Department, EmployeeStatus, Profile, UserRole, WelcomeEmailMode } from "@/lib/types";

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

function normalizeWelcomeEmailMode(value: string): WelcomeEmailMode {
  if (value === "automatic" || value === "manual") {
    return value;
  }

  throw new Error("Please select a valid welcome email mode.");
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

/**
 * Persist a final welcome_email_status for an employee with bounded retries.
 * The update is scoped to the employee id and current welcome_email_status = 'sending'.
 * Returns { success, message } where success=true means the status was persisted.
 */
async function persistWelcomeStatusWithRetry(
  admin: any,
  employeeId: string,
  desiredStatus: string,
  maxAttempts = 3,
  // optional context for audit record creation when retries are exhausted
  auditContext?: { actorId?: string | null; employeeName?: string | null; employeeEmail?: string | null }
) {
  let lastError: any = null;
  // No delay before first attempt. Use 300ms backoff between subsequent attempts.
  const backoffMs = 300;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await admin
        .from("profiles")
        .update({ welcome_email_status: desiredStatus })
        .eq("id", employeeId)
        .eq("welcome_email_status", "sending")
        .select();

      if (error) {
        lastError = error;
      } else {
        if (data && data.length === 1) {
          return { success: true };
        }

        // No rows updated => current status was not 'sending'. Respect current state; do not overwrite.
        return { success: false, message: "Profile not in 'sending' state; no update performed" };
      }
    } catch (err) {
      lastError = err;
    }

    // If not last attempt, wait a small backoff before retrying
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  // Exhausted retries — create a durable reconciliation record in audit_logs using project conventions.
  const auditDetails: Record<string, unknown> = {
    attempted_status: desiredStatus,
    previous_status: "sending",
    reconciliation: "required",
    last_error: lastError ? String(lastError.message || lastError) : null
  };

  if (auditContext?.employeeName) auditDetails["employee_name"] = auditContext.employeeName;
  if (auditContext?.employeeEmail) auditDetails["employee_email"] = auditContext.employeeEmail;

  // Attempt audit_logs insertion with bounded retries (3 attempts, 300ms backoff)
  let lastAuditError: any = null;
  let insertedAuditId: string | null = null;
  const auditAttempts = 3;
  for (let attempt = 1; attempt <= auditAttempts; attempt++) {
    try {
      const { data: auditData, error: auditError } = await admin
        .from("audit_logs")
        .insert({
          actor_id: auditContext?.actorId ?? null,
          action: "welcome_email_status_persistence_failed",
          entity_type: "profiles",
          entity_id: employeeId,
          details: auditDetails
        })
        .select();

      if (auditError) {
        lastAuditError = auditError;
      } else {
        // success; capture inserted id if returned
        if (Array.isArray(auditData) && auditData.length > 0 && (auditData[0] as any).id) {
          insertedAuditId = String((auditData[0] as any).id);
        }
        return {
          success: false,
          message: lastError ? String((lastError as any).message || lastError) : "Failed to persist status after retries",
          auditRecorded: true,
          auditId: insertedAuditId ?? null,
          lastError: lastError ? String((lastError as any).message || lastError) : null
        };
      }
    } catch (auditErr) {
      lastAuditError = auditErr;
    }

    if (attempt < auditAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  // All audit attempts failed
  return {
    success: false,
    message: lastError ? String((lastError as any).message || lastError) : "Failed to persist status after retries",
    auditRecorded: false,
    auditError: lastAuditError ? String((lastAuditError as any).message || lastAuditError) : null,
    lastError: lastError ? String((lastError as any).message || lastError) : null
  };
}

export async function createEmployee(formData: FormData) {
  const currentProfile = await requireAdminProfile();
  let authUserId: string | null = null;
  let success = false;
  let errorMessage = "Employee could not be created.";
  let successMessage = "Employee created successfully.";
  let profileInserted = false;

  try {
    requireAdminManager(currentProfile.role);

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const fullName = String(formData.get("full_name") || "").trim();
    const role = normalizeRole(String(formData.get("role") || "employee"));
    const status = normalizeEmployeeStatus(String(formData.get("status") || "active"));
    const welcomeEmailMode = normalizeWelcomeEmailMode(String(formData.get("welcome_email_mode") || "automatic"));
    const supervisorId = String(formData.get("supervisor_id") || "") || null;
    const employeeType = String(formData.get("employee_type") || "").trim() || null;
    const responsibilities = String(formData.get("responsibilities") || "").trim() || null;

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
      employee_type: employeeType,
      responsibilities,
      supervisor_id: supervisorId,
      joining_date: String(formData.get("joining_date") || "") || null,
      status,
      welcome_email_mode: welcomeEmailMode,
      welcome_email_status: "pending"
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      authUserId = null;
      throw new Error(profileError.message);
    }
    profileInserted = true;

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

    if (welcomeEmailMode === "automatic") {
      try {
        // Atomically claim pending -> sending before attempting to generate/send the welcome email.
        const { data: claimedRows, error: claimError } = await admin
          .from("profiles")
          .update({ welcome_email_status: "sending" })
          .eq("id", authData.user.id)
          .eq("welcome_email_mode", "automatic")
          .eq("welcome_email_status", "pending")
          .select();

        if (claimError) {
          successMessage = "Employee created, but welcome email could not be claimed for sending.";
        } else if (!claimedRows || claimedRows.length !== 1) {
          // Another process likely claimed or status changed; do not send again.
          successMessage = "Employee created. Welcome email will be sent automatically.";
        } else {
          // We successfully claimed the row. Attempt to send, and GUARANTEE recovery from 'sending'.
          try {
            const emailResult = await sendEmployeeWelcomeEmail({
              employeeId: authData.user.id,
              employeeName: fullName,
              email,
              designation: String(formData.get("designation") || "").trim() || null,
              employeeType: employeeType,
              responsibilities: responsibilities,
              departments,
              otherDepartmentText
            });

            const nextWelcomeEmailStatus = emailResult.status === "sent" ? "sent" : emailResult.status === "failed" ? "failed" : "skipped";

            // Persist final status with bounded retries, scoped to id and current status = 'sending'.
            const persistResult = await persistWelcomeStatusWithRetry(admin, authData.user.id, nextWelcomeEmailStatus, 3, {
              actorId: currentProfile.id,
              employeeName: fullName,
              employeeEmail: email
            });

            if (!persistResult.success) {
              if (persistResult.auditRecorded) {
                successMessage = `Employee created, but welcome email delivery status could not be persisted. Administrative reconciliation required.`;
              } else {
                successMessage = `Employee created, but welcome email delivery status could not be persisted and reconciliation logging failed: ${persistResult.message}`;
              }
            } else {
              successMessage =
                emailResult.status === "sent"
                  ? "Employee created and welcome email sent."
                  : `Employee created, but welcome email failed/skipped. ${emailResult.message}`;
            }
          } catch (sendError) {
            // Ensure we move sending -> failed. Do not retry sending the email itself.
            const recoverResult = await persistWelcomeStatusWithRetry(admin, authData.user.id, "failed", 3, {
              actorId: currentProfile.id,
              employeeName: fullName,
              employeeEmail: email
            });
            if (!recoverResult.success) {
              if (recoverResult.auditRecorded) {
                successMessage = "Employee created, but welcome email failed and administrative reconciliation was recorded.";
              } else {
                successMessage = `Employee created, but welcome email failed and status recovery also failed: ${recoverResult.message}`;
              }
            } else {
              successMessage = "Employee created, but welcome email failed.";
            }
          }
        }
      } catch (emailError) {
        successMessage = "Employee created, but welcome email failed.";
      }
    } else {
      await admin.from("profiles").update({ welcome_email_status: "pending" }).eq("id", authData.user.id);
      successMessage = "Employee created successfully. Welcome email will be sent manually later.";
    }

    revalidatePath("/admin/employees");
    revalidatePath("/admin/dashboard");
    success = true;
  } catch (error) {
    if (authUserId && !profileInserted) {
      await createAdminClient().auth.admin.deleteUser(authUserId);
    }

    errorMessage = error instanceof Error ? error.message : errorMessage;
  }

  redirectEmployeeStatus(success ? "success" : "error", success ? successMessage : errorMessage);
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
    const employeeType = String(formData.get("employee_type") || "").trim() || null;
    const responsibilities = String(formData.get("responsibilities") || "").trim() || null;
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
        employee_type: employeeType,
        responsibilities,
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

export async function sendManualEmployeeWelcomeEmail(formData: FormData) {
  const currentProfile = await requireAdminProfile();
  let success = false;
  let errorMessage = "Welcome email could not be sent.";

  try {
    requireAdminManager(currentProfile.role);

    const id = String(formData.get("id") || "").trim();
    if (!id) throw new Error("Employee id is required.");

    const admin = createAdminClient();
    const { data: employee, error: employeeError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single<Profile>();

    if (employeeError || !employee) {
      throw new Error("Employee profile was not found.");
    }

    if (!employee.email) {
      throw new Error("Employee email is not available.");
    }

    if (employee.welcome_email_mode !== "manual") {
      throw new Error("This employee is configured for automatic welcome email delivery.");
    }

    if (employee.welcome_email_status === "sent") {
      throw new Error("This employee already has a welcome email recorded as sent.");
    }

    if (!["pending", "failed", "skipped"].includes(employee.welcome_email_status)) {
      throw new Error("This employee is not eligible for manual welcome email resend.");
    }

    // Attempt an atomic claim: pending|failed|skipped -> sending
    const { data: claimedRows, error: claimError } = await admin
      .from("profiles")
      .update({ welcome_email_status: "sending" })
      .eq("id", id)
      .eq("welcome_email_mode", "manual")
      .in("welcome_email_status", ["pending", "failed", "skipped"])
      .select();

    if (claimError) {
      throw new Error(`Could not claim welcome email for sending: ${claimError.message}`);
    }

    if (!claimedRows || claimedRows.length !== 1) {
      throw new Error("This welcome email is already being sent or is no longer eligible.");
    }

    const assignmentsByEmployee = await fetchEmployeeDepartmentsByEmployee(admin, [employee.id]);
    const assignments = assignmentsByEmployee.get(employee.id) ?? [];
    const departments = assignments
      .map((assignment) => (Array.isArray(assignment.departments) ? assignment.departments[0] : assignment.departments))
      .filter((department): department is Department => Boolean(department));
    const otherDepartmentText = assignments.find((assignment) => {
      const department = Array.isArray(assignment.departments) ? assignment.departments[0] : assignment.departments;
      return department ? departmentDisplayName(department.name) === "Other" : false;
    })?.other_department ?? null;

    try {
      const emailResult = await sendEmployeeWelcomeEmail({
        employeeId: employee.id,
        employeeName: employee.full_name,
        email: employee.email,
        designation: employee.designation ?? null,
        employeeType: employee.employee_type ?? null,
        responsibilities: employee.responsibilities ?? null,
        departments,
        otherDepartmentText
      });

      const nextStatus = emailResult.status === "sent" ? "sent" : emailResult.status === "failed" ? "failed" : "skipped";

      const persistResult = await persistWelcomeStatusWithRetry(admin, employee.id, nextStatus, 3, {
        actorId: currentProfile.id,
        employeeName: employee.full_name ?? null,
        employeeEmail: employee.email ?? null
      });
      if (!persistResult.success) {
        if (persistResult.auditRecorded) {
          throw new Error("Welcome email may have been delivered but status persistence failed; administrative reconciliation recorded.");
        }
        throw new Error(`Welcome email may have been delivered but status persistence failed: ${persistResult.message}`);
      }

      if (nextStatus === "sent") {
        success = true;
        errorMessage = "";
        revalidatePath("/admin/employees");
        revalidatePath("/admin/dashboard");
      } else {
        errorMessage = `Welcome email could not be sent. ${emailResult.message}`;
        revalidatePath("/admin/employees");
        revalidatePath("/admin/dashboard");
      }
    } catch (sendError) {
      // Attempt to mark sending -> failed, but do not retry sending the email itself.
      const recoverResult = await persistWelcomeStatusWithRetry(admin, employee.id, "failed", 3);
      if (!recoverResult.success) {
        throw new Error(`Failed to send welcome email and recovery update failed: ${recoverResult.message}`);
      }

      throw sendError;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : errorMessage;
  }

  redirectEmployeeStatus(success ? "success" : "error", success ? "Welcome email sent successfully." : errorMessage);
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
