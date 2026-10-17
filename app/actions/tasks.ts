"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/app/actions/audit";
import { requireAdminProfile, requireProfile } from "@/lib/auth";
import { departmentDisplayName } from "@/lib/department-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import { isAdminManagerRole } from "@/lib/utils";

const ALL_ACTIVE_EMPLOYEES = "__all_active_employees__";
const priorities: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];

export async function assignTask(formData: FormData) {
  const profile = await requireAdminProfile();
  const admin = createAdminClient();
  const assignedToValues = formData.getAll("assigned_to");
  const assigningAll = assignedToValues.length === 1 && assignedToValues[0] === ALL_ACTIVE_EMPLOYEES;
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const dueDate = String(formData.get("due_date") || "");
  const priority = String(formData.get("priority") || "Medium") as TaskPriority;

  if (!title || !description || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !priorities.includes(priority)) {
    throw new Error("Please enter a title, description, valid due date and priority.");
  }

  let recipients: { id: string; department: string | null }[];
  if (assigningAll) {
    if (!isAdminManagerRole(profile.role)) throw new Error("Only admins can assign a task to all employees.");
    recipients = [];
    // Page through profiles so a large staff list cannot silently omit employees.
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data: employees, error: employeesError } = await admin
        .from("profiles")
        .select("id, department")
        .eq("role", "employee")
        .eq("status", "active")
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (employeesError) throw new Error("Active employees could not be loaded. Please try again.");
      recipients.push(...(employees ?? []).map((employee) => ({ id: employee.id, department: employee.department })));
      if (!employees || employees.length < pageSize) break;
    }
  } else {
    if (!assignedToValues.length || assignedToValues.some((value) => typeof value !== "string")) {
      throw new Error("Select at least one active employee.");
    }
    const employeeIds = assignedToValues as string[];
    if (employeeIds.includes(ALL_ACTIVE_EMPLOYEES) || employeeIds.length > 1000 ||
        employeeIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      throw new Error("Invalid employee selection.");
    }
    const uniqueIds = [...new Set(employeeIds)];
    recipients = [];
    for (let offset = 0; offset < uniqueIds.length; offset += 100) {
      const ids = uniqueIds.slice(offset, offset + 100);
      let query = admin.from("profiles").select("id, department")
        .in("id", ids).eq("role", "employee").eq("status", "active");
      if (!isAdminManagerRole(profile.role)) query = query.eq("supervisor_id", profile.id);
      const { data: employees, error: employeesError } = await query;
      if (employeesError) throw new Error("Selected employees could not be checked. Please try again.");
      if (employees?.length !== ids.length) throw new Error("One or more selected employees are unavailable for assignment.");
      recipients.push(...employees.map((employee) => ({ id: employee.id, department: employee.department })));
    }
  }

  if (!recipients.length) throw new Error("There are no active employees to assign.");

  const { data: tasks, error } = await admin
    .from("tasks")
    .insert(recipients.map((employee) => ({
      title,
      description,
      assigned_to: employee.id,
      assigned_by: profile.id,
      due_date: dueDate,
      priority,
      department: departmentDisplayName(employee.department) || "Other",
      status: "Pending"
    })))
    .select("id");

  if (error) throw new Error(error.message);
  if (tasks?.length !== recipients.length) throw new Error("Task assignment could not be verified. Please review the task list before retrying.");
  const { error: auditError } = await admin.from("audit_logs").insert(tasks.map((task) => ({
    actor_id: profile.id, action: "task assigned", entity_type: "tasks", entity_id: task.id, details: { title }
  })));
  if (auditError) throw new Error("Tasks were assigned, but their audit logs could not be recorded. Check the task list before retrying.");
  revalidatePath("/admin/tasks");
  revalidatePath("/employee/tasks");
}

export async function updateMyTaskStatus(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const taskId = String(formData.get("task_id"));
  const status = String(formData.get("status")) as TaskStatus;
  const progress = String(formData.get("progress_note") || "").trim();
  const completion = String(formData.get("completion_note") || "").trim();

  const { error } = await supabase.rpc("update_my_task_status", {
    task_id: taskId,
    new_status: status,
    progress,
    completion
  });

  if (error) throw new Error(error.message);
  await logAudit("task status changed", "tasks", taskId, { status }, { actorId: profile.id });
  revalidatePath("/employee/tasks");
  revalidatePath("/employee/dashboard");
  revalidatePath("/admin/tasks");
}
