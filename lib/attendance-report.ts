import { deriveAttendanceFlags } from "@/lib/attendance";
import type { AttendanceRecord, OrganizationSettings } from "@/lib/types";
import { parseTimeToMinutes } from "@/lib/utils";

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
    
    // Calculate worked minutes (from total_hours in db)
    const workedMinutes = record.total_hours ? Math.round(Number(record.total_hours) * 60) : 0;
    
    // Calculate overtime based on settings
    let overtimeMinutes = 0;
    const startMins = parseTimeToMinutes(settings.office_start_time) ?? 0;
    const endMins = parseTimeToMinutes(settings.office_end_time) ?? 0;
    
    // Scheduled Duration = configured Duty End - configured Duty Start
    // Handle overnight shifts if end < start
    let scheduledDurationMinutes = endMins - startMins;
    if (scheduledDurationMinutes < 0) {
      scheduledDurationMinutes += 24 * 60;
    }

    // Overtime logic: max(0, actual duration - scheduled duration)
    // Only calculate overtime if checkout is completed and actual hours >= scheduled hours
    if (record.check_out_at && workedMinutes > 0 && scheduledDurationMinutes > 0) {
      overtimeMinutes = Math.max(0, workedMinutes - scheduledDurationMinutes);
    }

    // Determine correction from schema if available
    // Currently, there's no direct "corrected" boolean in the basic schema unless we fetch audit logs.
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
      continue; // Skip pending records from totals (e.g. today before duty end with no check-in)
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
