import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { EmployeeSchedulePeriod, OfficeTimingPeriod, OrganizationSettings } from "@/lib/types";

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
  const admin = createAdminClient();
  const { data, error } = await admin
      .from("organization_settings")
      .select("*")
      .eq("id", defaultOrganizationSettings.id)
      .maybeSingle<OrganizationSettings>();

  if (error || !data) throw new Error("Office settings could not be loaded.");

  const [timingResult, holidayResult, scheduleResult] = await Promise.all([
    admin.from("office_timing_history")
      .select("effective_from, timezone, office_start_time, office_end_time, late_threshold_time")
      .order("effective_from", { ascending: true }),
    admin.from("office_holidays").select("holiday_date, name").order("holiday_date").limit(1000),
    admin.from("employee_schedule_history")
      .select("employee_id, effective_from, attendance_schedule")
      .order("effective_from", { ascending: true }).limit(1000)
  ]);
  const { data: history, error: historyError } = timingResult;
  if (historyError || !history?.length) throw new Error("Office timing history could not be loaded. Apply migration 027 first.");
  if (holidayResult.error || scheduleResult.error || (holidayResult.data?.length ?? 0) === 1000 ||
    (scheduleResult.data?.length ?? 0) === 1000) {
    throw new Error("Attendance calendar could not be loaded. Apply migration 028 first.");
  }

  return {
    ...data,
    office_timing_history: history as OfficeTimingPeriod[],
    office_holidays: (holidayResult.data ?? []).map((holiday) => holiday.holiday_date),
    office_holiday_details: holidayResult.data ?? [],
    employee_schedule_history: (scheduleResult.data ?? []) as EmployeeSchedulePeriod[]
  };
}
