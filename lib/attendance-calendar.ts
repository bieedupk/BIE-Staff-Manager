import type { OrganizationSettings } from "@/lib/types";

export function isNonWorkingDate(employeeId: string, workDate: string, settings: OrganizationSettings): boolean {
  return nonWorkingReason(employeeId, workDate, settings) !== null;
}

export function nonWorkingReason(employeeId: string, workDate: string, settings: OrganizationSettings): string | null {
  if (settings.office_holidays?.includes(workDate)) {
    const name = settings.office_holiday_details?.find((holiday) => holiday.holiday_date === workDate)?.name;
    return name ? `Office holiday: ${name}` : "Office holiday";
  }

  const schedule = settings.employee_schedule_history
    ?.filter((period) => period.employee_id === employeeId && period.effective_from <= workDate)
    .at(-1)?.attendance_schedule;

  // Friday is an automatic off day only for the weekly Friday schedule.
  return schedule === "weekly_friday" && new Date(`${workDate}T00:00:00Z`).getUTCDay() === 5
    ? "Weekly Friday off (employee schedule)"
    : null;
}
