import type { OfficeTimingPeriod, OrganizationSettings } from "@/lib/types";

export function officeTimingPeriodForDate(periods: OfficeTimingPeriod[] | undefined, workDate: string): OfficeTimingPeriod {
  if (!periods?.length) throw new Error("Office timing history is missing.");
  const period = [...periods].reverse().find((item) => item.effective_from <= workDate);
  if (!period) throw new Error(`No office timing applies to ${workDate}.`);
  return period;
}

export function officeTimingForDate<T extends Pick<OrganizationSettings, "timezone" | "office_start_time" | "office_end_time" | "late_threshold_time">>(
  settings: T & { office_timing_history?: OfficeTimingPeriod[] },
  workDate: string
): T {
  return { ...settings, ...officeTimingPeriodForDate(settings.office_timing_history, workDate) };
}
