"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/app/actions/audit";
import { requireAdminProfile, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isAdminManagerRole } from "@/lib/utils";

export async function applyLeave(formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: profile.id,
    leave_type: String(formData.get("leave_type") || ""),
    from_date: String(formData.get("from_date") || ""),
    to_date: String(formData.get("to_date") || ""),
    reason: String(formData.get("reason") || "").trim(),
    status: "Pending"
  });

  if (error) throw new Error(error.message);
  await logAudit("leave requested", "leave_requests", null, undefined, { actorId: profile.id });
  revalidatePath("/employee/leave");
  revalidatePath("/admin/leaves");
}

export async function reviewLeave(formData: FormData) {
  const profile = await requireAdminProfile();
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));

  if (!isAdminManagerRole(profile.role)) {
    const { data: leave } = await supabase.from("leave_requests").select("employee_id").eq("id", id).maybeSingle();
    if (!leave) {
      throw new Error("Supervisors can review leave only for employees assigned to them.");
    }
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status,
      admin_comment: String(formData.get("admin_comment") || "").trim() || null,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  await logAudit(`leave ${status.toLowerCase()}`, "leave_requests", id, { status }, { actorId: profile.id });
  revalidatePath("/admin/leaves");
  revalidatePath("/employee/leave");
}
