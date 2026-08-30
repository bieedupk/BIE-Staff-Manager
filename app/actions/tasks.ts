"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/app/actions/audit";
import { requireAdminProfile, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/types";
import { isAdminManagerRole } from "@/lib/utils";

export async function assignTask(formData: FormData) {
  const profile = await requireAdminProfile();
  const supabase = await createClient();
  const assignedTo = String(formData.get("assigned_to") || "");

  if (!isAdminManagerRole(profile.role)) {
    const { data: supervisedEmployee } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", assignedTo)
      .eq("supervisor_id", profile.id)
      .maybeSingle();

    if (!supervisedEmployee) {
      throw new Error("Supervisors can assign tasks only to employees assigned to them.");
    }
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      assigned_to: assignedTo,
      assigned_by: profile.id,
      due_date: String(formData.get("due_date") || ""),
      priority: String(formData.get("priority") || "Medium"),
      department: String(formData.get("department") || "Other"),
      status: "Pending"
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  await logAudit("task assigned", "tasks", task?.id, { title: formData.get("title") }, { actorId: profile.id });
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
