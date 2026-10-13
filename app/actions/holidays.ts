"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminManagerRole } from "@/lib/utils";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export async function addOfficeHoliday(formData: FormData) {
  const actor = await requireAdminProfile();
  if (!isAdminManagerRole(actor.role)) throw new Error("Only an admin can manage holidays.");
  const date = String(formData.get("holiday_date") || "").trim();
  const name = String(formData.get("holiday_name") || "").trim();
  if (!validDate(date) || name.length < 1 || name.length > 120) {
    redirect("/admin/settings?holiday_error=Enter%20a%20valid%20date%20and%20name");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("office_holidays").insert({ holiday_date: date, name });
  if (error) redirect(`/admin/settings?holiday_error=${encodeURIComponent(error.message)}`);
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: actor.id, action: "office_holiday_added", entity_type: "office_holidays",
    details: { holiday_date: date, name }
  });
  if (auditError) throw new Error(`Holiday was saved but audit failed: ${auditError.message}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/attendance");
  redirect("/admin/settings?holiday_success=Holiday%20saved");
}

export async function removeOfficeHoliday(formData: FormData) {
  const actor = await requireAdminProfile();
  if (!isAdminManagerRole(actor.role)) throw new Error("Only an admin can manage holidays.");
  const date = String(formData.get("holiday_date") || "").trim();
  if (!validDate(date)) throw new Error("Invalid holiday date.");

  const admin = createAdminClient();
  const { data, error } = await admin.from("office_holidays").delete()
    .eq("holiday_date", date).select("holiday_date, name").maybeSingle();
  if (error) redirect(`/admin/settings?holiday_error=${encodeURIComponent(error.message)}`);
  if (data) {
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: actor.id, action: "office_holiday_removed", entity_type: "office_holidays",
      details: { holiday_date: date, name: data.name }
    });
    if (auditError) throw new Error(`Holiday was removed but audit failed: ${auditError.message}`);
  }
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/attendance");
  redirect("/admin/settings?holiday_success=Holiday%20removed");
}
