import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceRecord, AttendanceStatus, OrganizationSettings, Profile } from "@/lib/types";
import { formatTime, formatWorkedDuration, getHalfDayThresholdHours, isDutyEndedForDate, isOfficeHoursEnded, getOrgCurrentTimeHHMM, parseTimeToMinutes, todayISOInTimezone } from "@/lib/utils";

const existingHalfDayThresholdHours = 4;
const DEFAULT_HISTORY_DAYS = 10;

function subtractDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() - days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDateRange(startISO: string, endISO: string): string[] {
  const dates: string[] = [];
  const [startY, startM, startD] = startISO.split("-").map(Number);
  const [endY, endM, endD] = endISO.split("-").map(Number);
  const current = new Date(startY, startM - 1, startD);
  const end = new Date(endY, endM - 1, endD);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function logAttendanceRead(source: string, profileId: string, dateLabel: string, found: boolean, readSource: string, error?: string) {
  console.log(
    `[attendance:${source}] employee=${profileId.slice(-8)} date=${dateLabel} found=${found} source=${readSource} error=${error ?? "none"}`
  );
}

export async function getTodayAttendanceForEmployee(
  profileId: string,
  today: string,
  source: string,
  settings: Pick<OrganizationSettings, "office_end_time" | "timezone">
): Promise<{ attendance: AttendanceRecord | null; isApprovedLeaveToday: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("employee_id", profileId)
    .eq("work_date", today)
    .maybeSingle();

  let fallbackData = null;
  const admin = createAdminClient();

  if (!data) {
    logAttendanceRead(source, profileId, today, false, "session", error?.message);
    const { data: fbData, error: fallbackError } = await admin
      .from("attendance")
      .select("*")
      .eq("employee_id", profileId)
      .eq("work_date", today)
      .maybeSingle();

    fallbackData = fbData;
    logAttendanceRead(source, profileId, today, Boolean(fallbackData), "server-fallback", fallbackError?.message);
  } else {
    logAttendanceRead(source, profileId, today, true, "session", error?.message);
  }

  let attendance = (data || fallbackData || null) as AttendanceRecord | null;

  // Check for Approved Leave
  const { data: leave, error: leaveError } = await admin
    .from("leave_requests")
    .select("id")
    .eq("employee_id", profileId)
    .eq("status", "Approved")
    .lte("from_date", today)
    .gte("to_date", today)
    .limit(1)
    .maybeSingle();

  if (leaveError) {
    throw new Error(`Failed to check Approved Leave for today: ${leaveError.message}`);
  }

  const isApprovedLeaveToday = Boolean(leave);
  const isDutyEnded = isDutyEndedForDate(today, settings);

  if (isApprovedLeaveToday) {
    if (isDutyEnded) {
      if (!attendance) {
        attendance = {
          id: `synthetic-leave-${profileId}-${today}`,
          employee_id: profileId,
          work_date: today,
          check_in_at: null,
          check_out_at: null,
          total_hours: null,
          status: "Leave",
          correction_count: 0,
          created_at: new Date().toISOString()
        } as AttendanceRecord;
      } else if (!attendance.check_in_at && !attendance.check_out_at && (!attendance.total_hours || Number(attendance.total_hours) === 0)) {
        attendance = { ...attendance, status: "Leave" };
      }
    } else {
      if (attendance && isEmptyFinalAttendancePlaceholder(attendance)) {
        attendance = null;
      }
    }
  } else {
    if (attendance && isEmptyFinalAttendancePlaceholder(attendance)) {
      attendance = null;
    }
  }

  return { attendance, isApprovedLeaveToday };
}

export function isEmptyFinalAttendancePlaceholder(record: Pick<AttendanceRecord, "status" | "check_in_at" | "check_out_at" | "total_hours" | "correction_count">): boolean {
  return (
    record.status === "Leave" &&
    record.check_in_at === null &&
    record.check_out_at === null &&
    (record.total_hours === null || Number(record.total_hours) === 0) &&
    (record.correction_count || 0) === 0
  );
}

export async function getMonthlyAttendanceForEmployee(profileId: string, monthStart: string, source: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("employee_id", profileId)
    .gte("work_date", monthStart)
    .order("work_date", { ascending: false });

  if ((data?.length ?? 0) > 0 || error) {
    console.log(
      `[attendance:${source}] employee=${profileId.slice(-8)} month_start=${monthStart} count=${data?.length ?? 0} source=session error=${error?.message ?? "none"}`
    );
    return (data ?? []) as AttendanceRecord[];
  }

  const admin = createAdminClient();
  const { data: fallbackData, error: fallbackError } = await admin
    .from("attendance")
    .select("*")
    .eq("employee_id", profileId)
    .gte("work_date", monthStart)
    .order("work_date", { ascending: false });

  console.log(
    `[attendance:${source}] employee=${profileId.slice(-8)} month_start=${monthStart} count=${fallbackData?.length ?? 0} source=server-fallback error=${fallbackError?.message ?? "none"}`
  );
  return (fallbackData ?? []) as AttendanceRecord[];
}

export async function getRecentAttendanceForEmployee(
  profileId: string,
  today: string,
  source: string,
  days: number = DEFAULT_HISTORY_DAYS
) {
  const startDate = subtractDaysISO(today, days);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("*, profiles(id, full_name, email, department, department_id, designation)")
    .eq("employee_id", profileId)
    .gte("work_date", startDate)
    .lte("work_date", today)
    .order("work_date", { ascending: false })
    .order("check_in_at", { ascending: false });

  if ((data?.length ?? 0) > 0 || error) {
    console.log(
      `[attendance:${source}] employee=${profileId.slice(-8)} recent=${days}d start_date=${startDate} count=${data?.length ?? 0} source=session error=${error?.message ?? "none"}`
    );
    return (data ?? []) as AttendanceRecord[];
  }

  const admin = createAdminClient();
  const { data: fallbackData, error: fallbackError } = await admin
    .from("attendance")
    .select("*, profiles(id, full_name, email, department, department_id, designation)")
    .eq("employee_id", profileId)
    .gte("work_date", startDate)
    .lte("work_date", today)
    .order("work_date", { ascending: false })
    .order("check_in_at", { ascending: false });

  console.log(
    `[attendance:${source}] employee=${profileId.slice(-8)} recent=${days}d start_date=${startDate} count=${fallbackData?.length ?? 0} source=server-fallback error=${fallbackError?.message ?? "none"}`
  );
  return (fallbackData ?? []) as AttendanceRecord[];
}

export async function getRecentAttendanceForAll(
  today: string,
  source: string,
  employeeId?: string,
  days: number = DEFAULT_HISTORY_DAYS
) {
  const startDate = subtractDaysISO(today, days);
  const supabase = await createClient();

  let query = supabase
    .from("attendance")
    .select("*, profiles(id, full_name, department, department_id, designation)")
    .gte("work_date", startDate)
    .lte("work_date", today)
    .order("work_date", { ascending: false })
    .order("check_in_at", { ascending: false });

  if (employeeId) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;

  if ((data?.length ?? 0) > 0 || error) {
    console.log(
      `[attendance:${source}] recent=${days}d start_date=${startDate} employee=${employeeId?.slice(-8) ?? "all"} count=${data?.length ?? 0} source=session error=${error?.message ?? "none"}`
    );
    return (data ?? []) as AttendanceRecord[];
  }

  const admin = createAdminClient();

  let adminQuery = admin
    .from("attendance")
    .select("*, profiles(id, full_name, department, department_id, designation)")
    .gte("work_date", startDate)
    .lte("work_date", today)
    .order("work_date", { ascending: false })
    .order("check_in_at", { ascending: false });

  if (employeeId) {
    adminQuery = adminQuery.eq("employee_id", employeeId);
  }

  const { data: fallbackData, error: fallbackError } = await adminQuery;

  console.log(
    `[attendance:${source}] recent=${days}d start_date=${startDate} employee=${employeeId?.slice(-8) ?? "all"} count=${fallbackData?.length ?? 0} source=server-fallback error=${fallbackError?.message ?? "none"}`
  );
  return (fallbackData ?? []) as AttendanceRecord[];
}

export function createSyntheticFinalRecord(
  employeeId: string,
  workDate: string,
  profile: Pick<Profile, "id" | "full_name" | "email" | "department" | "department_id" | "designation">,
  status: AttendanceStatus = "Absent"
): AttendanceRecord {
  const typeStr = status.toLowerCase();
  return {
    id: `synthetic-${typeStr}-${employeeId}-${workDate}`,
    employee_id: employeeId,
    work_date: workDate,
    check_in_at: null,
    check_out_at: null,
    total_hours: null,
    status,
    correction_count: 0,
    created_at: new Date().toISOString(),
    profiles: profile
  };
}

export async function getApprovedLeaveDates(
  employeeIds: string[],
  startDate: string,
  endDate: string
): Promise<Map<string, Set<string>>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select("employee_id, from_date, to_date")
    .eq("status", "Approved")
    .in("employee_id", employeeIds)
    .lte("from_date", endDate)
    .gte("to_date", startDate);

  if (error) {
    throw new Error(`Failed to load Approved Leave data: ${error.message}`);
  }

  const leaveMap = new Map<string, Set<string>>();
  for (const empId of employeeIds) {
    leaveMap.set(empId, new Set());
  }

  if (data) {
    for (const req of data) {
      const dates = getDateRange(
        req.from_date > startDate ? req.from_date : startDate,
        req.to_date < endDate ? req.to_date : endDate
      );
      const empSet = leaveMap.get(req.employee_id) || new Set();
      for (const d of dates) {
        empSet.add(d);
      }
      leaveMap.set(req.employee_id, empSet);
    }
  }

  return leaveMap;
}

export function buildCompleteTimelineWithAbsent(
  actualRecords: AttendanceRecord[],
  employee: Profile,
  startDate: string,
  endDate: string,
  settings?: Pick<OrganizationSettings, "office_end_time" | "timezone">,
  approvedLeaves: Set<string> = new Set()
): AttendanceRecord[] {
  const recordsByDate = new Map(actualRecords.map((r) => [r.work_date, r]));
  const dates = getDateRange(startDate, endDate);

  const timeline: AttendanceRecord[] = [];
  for (const date of dates.reverse()) {
    const existing = recordsByDate.get(date);
    const isApprovedLeave = approvedLeaves.has(date);
    const isDutyEnded = settings ? isDutyEndedForDate(date, settings) : true;

    if (existing) {
      if (isDutyEnded) {
        if (isApprovedLeave) {
          const hasWorked = existing.check_in_at !== null || existing.check_out_at !== null || (existing.total_hours !== null && Number(existing.total_hours) > 0) || (existing.correction_count ?? 0) > 0;
          if (!hasWorked) {
            timeline.push({ ...existing, status: "Leave" });
          } else {
            timeline.push(existing);
          }
          continue;
        } else {
          if (!isEmptyFinalAttendancePlaceholder(existing)) {
            timeline.push(existing);
            continue;
          }
        }
      } else {
        if (isEmptyFinalAttendancePlaceholder(existing)) {
          continue;
        }
        timeline.push(existing);
        continue;
      }
    }

    if (settings && !isDutyEnded) {
      continue;
    }

    const finalStatus = isApprovedLeave ? "Leave" : "Absent";
    timeline.push(
      createSyntheticFinalRecord(
        employee.id,
        date,
        {
          id: employee.id,
          full_name: employee.full_name,
          email: employee.email,
          department: employee.department,
          department_id: employee.department_id,
          designation: employee.designation
        },
        finalStatus
      )
    );
  }

  return timeline;
}

export function attendanceDisplayStatus(attendance: AttendanceRecord | null) {
  if (!attendance) return "Not Checked In";
  if (attendance.status === "Leave") return "Leave";
  if (attendance.status === "Absent") return "Absent";
  if (attendance.check_in_at && attendance.check_out_at) return "Attendance Completed";
  if (attendance.check_in_at && !attendance.check_out_at) return "Pending";
  return "Not Checked In";
}

export function formatDurationFromHours(hours: number | null | undefined) {
  return formatWorkedDuration(hours);
}

export {
  formatDecimalHours,
  formatDurationMinutes,
  formatTime,
  formatWorkedDuration,
  getHalfDayThresholdHours,
  getOrgCurrentTimeHHMM,
  getOrgCurrentTimeMinutes,
  isDutyEndedForDate,
  isOfficeHoursEnded,
  parseTimeToMinutes,
  todayISOInTimezone
} from "@/lib/utils";

export type AttendanceFlags = {
  isPresent: boolean;
  isLate: boolean;
  isHalfDay: boolean;
  isAbsent: boolean;
  isPending: boolean;
  isLeave: boolean;
  displayStatuses: Array<"Present" | "Late" | "Half Day" | "Absent" | "Pending" | "Leave">;
};

export function deriveAttendanceFlags(
  attendance:
    | (Pick<AttendanceRecord, "check_in_at" | "check_out_at" | "total_hours"> & Partial<Pick<AttendanceRecord, "work_date" | "status">>)
    | null
    | undefined,
  settings: Pick<OrganizationSettings, "timezone" | "late_threshold_time" | "office_start_time" | "office_end_time">
): AttendanceFlags {
  if (attendance?.status === "Leave") {
    const hasWorked = attendance.check_in_at !== null || attendance.check_out_at !== null || (attendance.total_hours !== null && Number(attendance.total_hours) > 0);
    if (!hasWorked) {
      return {
        isPresent: false,
        isLate: false,
        isHalfDay: false,
        isAbsent: false,
        isPending: false,
        isLeave: true,
        displayStatuses: ["Leave"]
      };
    }
  }

  if (attendance?.status === "Absent") {
    return {
      isPresent: false,
      isLate: false,
      isHalfDay: false,
      isAbsent: true,
      isPending: false,
      isLeave: false,
      displayStatuses: ["Absent"]
    };
  }

  if (!attendance?.check_in_at) {
    const isPending = Boolean(attendance?.work_date && !isDutyEndedForDate(attendance.work_date, settings));
    if (isPending || attendance?.status === "Pending") {
      return {
        isPresent: false,
        isLate: false,
        isHalfDay: false,
        isAbsent: false,
        isPending: true,
        isLeave: false,
        displayStatuses: ["Pending"]
      };
    }

    return {
      isPresent: false,
      isLate: false,
      isHalfDay: false,
      isAbsent: true,
      isPending: false,
      isLeave: false,
      displayStatuses: ["Absent"]
    };
  }

  if (!attendance.check_out_at) {
    return {
      isPresent: false,
      isLate: false,
      isHalfDay: false,
      isAbsent: false,
      isPending: true,
      isLeave: false,
      displayStatuses: ["Pending"]
    };
  }

  const lateThreshold = parseTimeToMinutes(settings.late_threshold_time) ?? 0;
  const isLate = timeInZoneMinutes(attendance.check_in_at, settings.timezone) > lateThreshold;
  const halfDayThreshold = getHalfDayThresholdHours(settings);
  const isHalfDay =
    attendance.total_hours !== null &&
    Number(attendance.total_hours) <= halfDayThreshold;

  const displayStatuses: AttendanceFlags["displayStatuses"] = ["Present"];
  if (isLate) {
    displayStatuses.push("Late");
  }
  if (isHalfDay) {
    displayStatuses.push("Half Day");
  }

  return {
    isPresent: true,
    isLate,
    isHalfDay,
    isAbsent: false,
    isPending: false,
    isLeave: false,
    displayStatuses
  };
}

function timeInZoneMinutes(value: string, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone
    }).formatToParts(new Date(value));
    let hours = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    if (hours === 24) hours = 0;
    const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return hours * 60 + minutes;
  } catch {
    const date = new Date(value);
    return date.getHours() * 60 + date.getMinutes();
  }
}
