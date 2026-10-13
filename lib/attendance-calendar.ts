import type { OrganizationSettings } from "@/lib/types";

export function isNonWorkingDate(employeeId: string, workDate: string, settings: OrganizationSettings): boolean {
  if (settings.office_holidays?.includes(workDate)) return true;

  const schedule = settings.employee_schedule_history
    ?.filter((period) => period.employee_id === employeeId && period.effective_from <= workDate)
    .at(-1)?.attendance_schedule;

  // Friday is an automatic off day only for the weekly Friday schedule.
  return schedule === "weekly_friday" && new Date(`${workDate}T00:00:00Z`).getUTCDay() === 5;
}
