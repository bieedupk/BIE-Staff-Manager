"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminProfile } from "@/lib/auth";
import { defaultOrganizationSettings } from "@/lib/organization-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminManagerRole } from "@/lib/utils";

function redirectSettings(type: "success" | "error", message: string) {
  redirect(`/admin/settings?office_settings_${type}=${encodeURIComponent(message)}`);
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
    redirectSettings("error", "You are not allowed to update settings.");
  }

  const timezone = settingValue(formData, "timezone", defaultOrganizationSettings.timezone);
  const officeStartTime = settingValue(formData, "office_start_time", "09:00");
  const officeEndTime = settingValue(formData, "office_end_time", "17:00");
  const lateThresholdTime = settingValue(formData, "late_threshold_time", "09:30");

  if (!timezone || !officeStartTime || !officeEndTime || !lateThresholdTime) {
    redirectSettings("error", "Office timing settings are required.");
  }

  if (!validateTimezone(timezone)) {
    redirectSettings("error", "Enter a valid timezone.");
  }

  const { error } = await createAdminClient().from("organization_settings").upsert({
    id: defaultOrganizationSettings.id,
    organization_name: defaultOrganizationSettings.organization_name,
    short_name: defaultOrganizationSettings.short_name,
    timezone,
    office_start_time: officeStartTime,
    office_end_time: officeEndTime,
    late_threshold_time: lateThresholdTime
  });

  if (error) {
    redirectSettings("error", "Office timing settings could not be saved. Run the organization settings migration first.");
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/dashboard");
  redirectSettings("success", "Office timing updated successfully.");
}
