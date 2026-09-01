import { deriveAttendanceFlags } from "@/lib/attendance";
import type { AttendanceRecord, OrganizationSettings } from "@/lib/types";
import { parseTimeToMinutes, todayISOInTimezone } from "@/lib/utils";

export type DailyAttendanceRow = {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  overtimeMinutes: number;
  isPresent: boolean;
  isAbsent: boolean;
  isLate: boolean;
  isHalfDay: boolean;
  isCompleted: boolean;
  isPending: boolean;
  isCorrected: boolean | null;
};

export type AttendanceReportTotals = {
  eligibleDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  halfDays: number;
  completedDays: number;
  totalWorkingMinutes: number;
  totalOvertimeMinutes: number;
};

export type AttendanceReportRatios = {
  attendanceRate: number;
  absenceRate: number;
  lateRate: number;
  halfDayRate: number;
  punctualityRate: number;
};

export type AttendanceReport = {
  period: {
    from: string;
    to: string;
  };
  totals: AttendanceReportTotals;
  ratios: AttendanceReportRatios;
  daily: DailyAttendanceRow[];
};

export function buildAttendanceReport(
  records: AttendanceRecord[],
  from: string,
  to: string,
  settings: OrganizationSettings
): AttendanceReport {
  const daily: DailyAttendanceRow[] = records.map((record) => {
    const flags = deriveAttendanceFlags(record, settings);

    const workedMinutes = record.total_hours ? Math.round(Number(record.total_hours) * 60) : 0;

    let overtimeMinutes = 0;
    const startMins = parseTimeToMinutes(settings.office_start_time) ?? 0;
    const endMins = parseTimeToMinutes(settings.office_end_time) ?? 0;

    let scheduledDurationMinutes = endMins - startMins;
    if (scheduledDurationMinutes < 0) {
      scheduledDurationMinutes += 24 * 60;
    }

    if (record.check_out_at && workedMinutes > 0 && scheduledDurationMinutes > 0) {
      overtimeMinutes = Math.max(0, workedMinutes - scheduledDurationMinutes);
    }

    const isCorrected = null;

    return {
      date: record.work_date,
      checkIn: record.check_in_at,
      checkOut: record.check_out_at,
      workedMinutes,
      overtimeMinutes,
      isPresent: flags.isPresent,
      isAbsent: flags.isAbsent,
      isLate: flags.isLate,
      isHalfDay: flags.isHalfDay,
      isCompleted: Boolean(record.check_out_at),
      isPending: flags.isPending,
      isCorrected
    };
  });

  const totals = calculateAttendanceMetrics(daily);
  const ratios = calculateAttendanceRatios(totals);

  return {
    period: { from, to },
    totals,
    ratios,
    daily
  };
}

export function calculateAttendanceMetrics(dailyRows: DailyAttendanceRow[]): AttendanceReportTotals {
  let eligibleDays = 0;
  let presentDays = 0;
  let absentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let completedDays = 0;
  let totalWorkingMinutes = 0;
  let totalOvertimeMinutes = 0;

  for (const row of dailyRows) {
    if (row.isPending) {
      continue;
    }

    eligibleDays++;

    if (row.isPresent) presentDays++;
    if (row.isAbsent) absentDays++;
    if (row.isLate) lateDays++;
    if (row.isHalfDay) halfDays++;
    if (row.isCompleted) completedDays++;

    totalWorkingMinutes += row.workedMinutes;
    totalOvertimeMinutes += row.overtimeMinutes;
  }

  return {
    eligibleDays,
    presentDays,
    absentDays,
    lateDays,
    halfDays,
    completedDays,
    totalWorkingMinutes,
    totalOvertimeMinutes
  };
}

export function calculateAttendanceRatios(totals: AttendanceReportTotals): AttendanceReportRatios {
  const { eligibleDays, presentDays, lateDays, halfDays } = totals;
  const onTimePresentDays = Math.max(0, presentDays - lateDays);

  return {
    attendanceRate: eligibleDays > 0 ? (presentDays / eligibleDays) * 100 : 0,
    absenceRate: eligibleDays > 0 ? (totals.absentDays / eligibleDays) * 100 : 0,
    lateRate: presentDays > 0 ? (lateDays / presentDays) * 100 : 0,
    halfDayRate: presentDays > 0 ? (halfDays / presentDays) * 100 : 0,
    punctualityRate: presentDays > 0 ? (onTimePresentDays / presentDays) * 100 : 0
  };
}

// -----------------------------------------------------------------------------
// PHASE 2B: REPORT PERIOD GENERATORS
// -----------------------------------------------------------------------------

function dateToISO(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    return y && m && d ? `${y}-${m}-${d}` : date.toISOString().split("T")[0];
  } catch {
    return date.toISOString().split("T")[0];
  }
}

function parseDateZ(isoString: string): Date {
  return new Date(`${isoString}T00:00:00Z`);
}

function addDays(isoString: string, days: number): string {
  const date = parseDateZ(isoString);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

export function getWeeklyPeriod(inputDate: string | undefined, timezone: string) {
  const todayOrg = todayISOInTimezone(timezone);
  const targetDateStr = inputDate && inputDate <= todayOrg ? inputDate : todayOrg;

  const targetDate = parseDateZ(targetDateStr);
  // Monday = 1, Sunday = 0
  let dayOfWeek = targetDate.getUTCDay();
  if (dayOfWeek === 0) dayOfWeek = 7;

  const daysSinceMonday = dayOfWeek - 1;
  const monday = addDays(targetDateStr, -daysSinceMonday);

  // End of week is Sunday, but capped at todayOrg
  const sunday = addDays(monday, 6);
  const actualEnd = sunday > todayOrg ? todayOrg : sunday;

  // Previous equivalent week
  const previousMonday = addDays(monday, -7);
  const elapsedDays = Math.round((parseDateZ(actualEnd).getTime() - parseDateZ(monday).getTime()) / 86400000);
  const previousEnd = addDays(previousMonday, elapsedDays);

  return {
    current: { from: monday, to: actualEnd, fullEnd: sunday },
    previous: { from: previousMonday, to: previousEnd, fullEnd: addDays(previousMonday, 6) }
  };
}

export function getMonthlyPeriod(monthStr: string | undefined, timezone: string) {
  const todayOrg = todayISOInTimezone(timezone);
  const currentMonthStr = todayOrg.substring(0, 7);

  let targetMonth = monthStr || currentMonthStr;
  if (targetMonth > currentMonthStr) {
    targetMonth = currentMonthStr;
  }

  const isCurrentMonth = targetMonth === currentMonthStr;

  const from = `${targetMonth}-01`;
  let to: string;
  let fullEnd: string;

  // Calculate fullEnd (last day of month)
  const nextMonthFirst = new Date(`${targetMonth}-01T00:00:00Z`);
  nextMonthFirst.setUTCMonth(nextMonthFirst.getUTCMonth() + 1);
  nextMonthFirst.setUTCDate(0);
  fullEnd = nextMonthFirst.toISOString().split("T")[0];

  if (isCurrentMonth) {
    to = todayOrg;
  } else {
    to = fullEnd;
  }

  // Previous month
  const prevMonthFirst = new Date(`${targetMonth}-01T00:00:00Z`);
  prevMonthFirst.setUTCMonth(prevMonthFirst.getUTCMonth() - 1);
  const prevMonthStr = prevMonthFirst.toISOString().substring(0, 7);
  const prevFrom = `${prevMonthStr}-01`;

  const prevMonthLast = new Date(`${targetMonth}-01T00:00:00Z`);
  prevMonthLast.setUTCDate(0);
  const prevFullEnd = prevMonthLast.toISOString().split("T")[0];

  let prevTo: string;
  if (isCurrentMonth) {
    // Equivalent elapsed days
    const elapsedDays = Math.round((parseDateZ(to).getTime() - parseDateZ(from).getTime()) / 86400000);
    const candidatePrevTo = addDays(prevFrom, elapsedDays);
    prevTo = candidatePrevTo > prevFullEnd ? prevFullEnd : candidatePrevTo;
  } else {
    prevTo = prevFullEnd;
  }

  return {
    current: { from, to, fullEnd },
    previous: { from: prevFrom, to: prevTo, fullEnd: prevFullEnd }
  };
}

export function getYearlyPeriod(yearStr: string | undefined, timezone: string) {
  const todayOrg = todayISOInTimezone(timezone);
  const currentYearStr = todayOrg.substring(0, 4);

  let targetYear = yearStr || currentYearStr;
  if (targetYear > currentYearStr) {
    targetYear = currentYearStr;
  }

  const isCurrentYear = targetYear === currentYearStr;

  const from = `${targetYear}-01-01`;
  const fullEnd = `${targetYear}-12-31`;
  const to = isCurrentYear ? todayOrg : fullEnd;

  const prevYear = String(Number(targetYear) - 1);
  const prevFrom = `${prevYear}-01-01`;
  const prevFullEnd = `${prevYear}-12-31`;

  let prevTo: string;
  if (isCurrentYear) {
    // Equivalent day of year
    const elapsedDays = Math.round((parseDateZ(to).getTime() - parseDateZ(from).getTime()) / 86400000);
    const candidatePrevTo = addDays(prevFrom, elapsedDays);
    prevTo = candidatePrevTo > prevFullEnd ? prevFullEnd : candidatePrevTo;
  } else {
    prevTo = prevFullEnd;
  }

  return {
    current: { from, to, fullEnd },
    previous: { from: prevFrom, to: prevTo, fullEnd: prevFullEnd }
  };
}

// -----------------------------------------------------------------------------
// COMPARISON ENGINE
// -----------------------------------------------------------------------------

export type Direction = "improved" | "declined" | "neutral" | "unchanged";

export type MetricComparison = {
  current: number;
  previous: number;
  delta: number;
  direction: Direction;
};

export type ReportComparison = {
  attendanceRate: MetricComparison;
  absentDays: MetricComparison;
  lateDays: MetricComparison;
  halfDays: MetricComparison;
  totalWorkingMinutes: MetricComparison;
  overtimeMinutes: MetricComparison;
  punctualityRate: MetricComparison;
};

function compare(current: number, previous: number, betterIsHigher: boolean | null): MetricComparison {
  const delta = current - previous;
  let direction: Direction = "unchanged";

  if (delta !== 0) {
    if (betterIsHigher === null) {
      direction = "neutral";
    } else if (delta > 0) {
      direction = betterIsHigher ? "improved" : "declined";
    } else {
      direction = betterIsHigher ? "declined" : "improved";
    }
  }

  return {
    current,
    previous,
    delta,
    direction
  };
}

export function compareAttendanceReports(current: AttendanceReport, previous: AttendanceReport): ReportComparison {
  return {
    attendanceRate: compare(current.ratios.attendanceRate, previous.ratios.attendanceRate, true),
    absentDays: compare(current.totals.absentDays, previous.totals.absentDays, false),
    lateDays: compare(current.totals.lateDays, previous.totals.lateDays, false),
    halfDays: compare(current.totals.halfDays, previous.totals.halfDays, false), // Generally lower is better
    totalWorkingMinutes: compare(current.totals.totalWorkingMinutes, previous.totals.totalWorkingMinutes, null),
    overtimeMinutes: compare(current.totals.totalOvertimeMinutes, previous.totals.totalOvertimeMinutes, null), // Always neutral
    punctualityRate: compare(current.ratios.punctualityRate, previous.ratios.punctualityRate, true)
  };
}
