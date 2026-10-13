import { officeTimingForDate } from "@/lib/office-timing";
import type { OrganizationSettings } from "@/lib/types";
import { getOrgCurrentTimeMinutes, parseTimeToMinutes, todayISOInTimezone } from "@/lib/utils";

export function liveAttendancePhase(settings: OrganizationSettings, workDate: string, now = new Date()) {
  if (workDate !== todayISOInTimezone(settings.timezone, now)) return "outside_today" as const;
  const timing = officeTimingForDate(settings, workDate);
  const current = getOrgCurrentTimeMinutes(timing.timezone, now);
  const start = parseTimeToMinutes(timing.office_start_time);
  const late = parseTimeToMinutes(timing.late_threshold_time);
  if (start === null || late === null || current < start) return "before_start" as const;
  return current < late ? "pending" as const : "absent" as const;
}
