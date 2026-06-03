import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { OrganizationSettings } from "@/lib/types";

export const defaultOrganizationSettings: OrganizationSettings = {
  id: "00000000-0000-0000-0000-000000000001",
  organization_name: "Board of Islamic Education",
  short_name: "BIE",
  timezone: "Asia/Karachi",
  office_start_time: "09:00:00",
  office_end_time: "17:00:00",
  late_threshold_time: "09:30:00",
  created_at: "",
  updated_at: ""
};

export async function getOrganizationSettings() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organization_settings")
      .select("*")
      .eq("id", defaultOrganizationSettings.id)
      .maybeSingle<OrganizationSettings>();

    if (error || !data) return defaultOrganizationSettings;

    return data;
  } catch {
    return defaultOrganizationSettings;
  }
}
