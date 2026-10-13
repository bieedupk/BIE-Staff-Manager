import type { AttendanceSchedule } from "@/lib/types";

const plans = {
  fortnight_two: { label: "2 days after 15 days", days: 2, intervalDays: 15, intervalMonths: 0 },
  monthly_four: { label: "4 days after one month", days: 4, intervalDays: 0, intervalMonths: 1 },
  bimonthly_eight: { label: "8 days after two months", days: 8, intervalDays: 0, intervalMonths: 2 }
} as const;

export function rotationPlan(schedule: AttendanceSchedule | undefined) {
  if (!schedule || !(schedule in plans)) return null;
  return plans[schedule as keyof typeof plans];
}

function isoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid rotation date.");
  }
  return date;
}

export function daysBetweenISO(from: string, to: string): number {
  return Math.round((isoDate(to).getTime() - isoDate(from).getTime()) / 86400000);
}

export function rotationEligibilityDate(anchor: string, schedule: AttendanceSchedule): string | null {
  const plan = rotationPlan(schedule);
  if (!plan) return null;
  const date = isoDate(anchor);
  if (plan.intervalMonths) {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + plan.intervalMonths);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  } else {
    date.setUTCDate(date.getUTCDate() + plan.intervalDays);
  }
  return date.toISOString().slice(0, 10);
}
