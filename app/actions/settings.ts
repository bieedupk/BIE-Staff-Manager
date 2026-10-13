"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth";
import { getWelcomeEmailTemplate } from "@/lib/email/templates";
import { defaultOrganizationSettings } from "@/lib/organization-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminManagerRole } from "@/lib/utils";

function redirectSettings(scope: "office_settings" | "email_template", type: "success" | "error", message: string) {
  redirect(`/admin/settings?${scope}_${type}=${encodeURIComponent(message)}`);
}

function settingValue(formData: FormData, key: string, fallback: string) {
  return String(formData.get(key) || fallback).trim();
}

function validateTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-PK", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function updateOfficeTimingSettings(formData: FormData) {
  const profile = await requireAdminProfile();

  if (!isAdminManagerRole(profile.role)) {
    redirectSettings("office_settings", "error", "You are not allowed to update settings.");
  }

  const timezone = settingValue(formData, "timezone", "");
  const officeStartTime = settingValue(formData, "office_start_time", "");
  const officeEndTime = settingValue(formData, "office_end_time", "");
  const lateThresholdTime = settingValue(formData, "late_threshold_time", "");

  if (!timezone || !officeStartTime || !officeEndTime || !lateThresholdTime) {
    redirectSettings("office_settings", "error", "Office timing settings are required.");
  }

  if (!validateTimezone(timezone)) {
    redirectSettings("office_settings", "error", "Enter a valid timezone.");
  }

  if (![officeStartTime, officeEndTime, lateThresholdTime].every((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
    redirectSettings("office_settings", "error", "Enter valid office times.");
  }

  const { error } = await createAdminClient().rpc("update_office_timing", {
    p_actor_id: profile.id,
    p_settings_id: defaultOrganizationSettings.id,
    p_timezone: timezone,
    p_office_start_time: officeStartTime,
    p_office_end_time: officeEndTime,
    p_late_threshold_time: lateThresholdTime
  });

  if (error) {
    redirectSettings("office_settings", "error", error.message || "Office timing settings could not be saved.");
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/attendance");
  redirectSettings("office_settings", "success", "Office timing updated successfully.");
}

export async function updateWelcomeEmailTemplate(formData: FormData) {
  const profile = await requireAdminProfile();

  if (!isAdminManagerRole(profile.role)) {
    redirectSettings("email_template", "error", "You are not allowed to update email templates.");
  }

  const subject = settingValue(formData, "subject", "");
  const bodyText = settingValue(formData, "body_text", "");
  const contactEmail = settingValue(formData, "contact_email", "");
  const contactPhone = settingValue(formData, "contact_phone", "");
  const contactAddress = settingValue(formData, "contact_address", "");

  if (!subject || !bodyText) {
    redirectSettings("email_template", "error", "Welcome email subject and body are required.");
  }

  const existing = await getWelcomeEmailTemplate();
  const { error } = await createAdminClient().from("email_templates").upsert(
    {
      template_key: "employee_welcome",
      subject,
      body_text: bodyText,
      body_html: existing.body_html,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      contact_address: contactAddress,
      is_active: true
    },
    { onConflict: "template_key" }
  );

  if (error) {
    redirectSettings("email_template", "error", "Welcome email template could not be saved. Run migration 013 first.");
  }

  revalidatePath("/admin/settings");
  redirectSettings("email_template", "success", "Welcome email template updated successfully.");
}
