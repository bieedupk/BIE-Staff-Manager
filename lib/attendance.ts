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

export async function getTodayAttendanceForEmployee(profileId: string, today: string, source: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("employee_id", profileId)
    .eq("work_date", today)
    .maybeSingle();

  if (data || error) {
    logAttendanceRead(source, profileId, today, Boolean(data), "session", error?.message);
    return (data ?? null) as AttendanceRecord | null;
  }

  const admin = createAdminClient();
  const { data: fallbackData, error: fallbackError } = await admin
    .from("attendance")
    .select("*")
    .eq("employee_id", profileId)
    .eq("work_date", today)
    .maybeSingle();

  logAttendanceRead(source, profileId, today, Boolean(fallbackData), "server-fallback", fallbackError?.message);
  return (fallbackData ?? null) as AttendanceRecord | null;
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

export function createSyntheticAbsentRecord(
  employeeId: string,
  workDate: string,
  profile: Pick<Profile, "id" | "full_name" | "email" | "department" | "department_id" | "designation">,
  status: AttendanceStatus = "Absent"
): AttendanceRecord {
  return {
    id: `synthetic-absent-${employeeId}-${workDate}`,
    employee_id: employeeId,
    work_date: workDate,
    check_in_at: null,
    check_out_at: null,
    total_hours: null,
    status,
    created_at: new Date().toISOString(),
    profiles: profile
  };
}

export function buildCompleteTimelineWithAbsent(
  actualRecords: AttendanceRecord[],
  employee: Profile,
  startDate: string,
  endDate: string,
  settings?: Pick<OrganizationSettings, "office_end_time" | "timezone">
): AttendanceRecord[] {
  const recordsByDate = new Map(actualRecords.map((r) => [r.work_date, r]));
  const dates = getDateRange(startDate, endDate);

  const timeline: AttendanceRecord[] = [];
  for (const date of dates.reverse()) {
    const existing = recordsByDate.get(date);
    if (existing) {
      timeline.push(existing);
      continue;
    }
    if (settings && !isDutyEndedForDate(date, settings)) {
      continue;
    }
    timeline.push(
      createSyntheticAbsentRecord(
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
        "Absent"
      )
    );
  }

  return timeline;
}

export function attendanceDisplayStatus(attendance: AttendanceRecord | null) {
  if (!attendance) return "Not Checked In";
  if (attendance.check_out_at) return "Attendance Completed";
  return "Checked In";
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
  displayStatuses: Array<"Present" | "Late" | "Half Day" | "Absent" | "Pending">;
};

export function deriveAttendanceFlags(
  attendance:
    | (Pick<AttendanceRecord, "check_in_at" | "check_out_at" | "total_hours"> & Partial<Pick<AttendanceRecord, "work_date" | "status">>)
    | null
    | undefined,
  settings: Pick<OrganizationSettings, "timezone" | "late_threshold_time" | "office_start_time" | "office_end_time">
): AttendanceFlags {
  if (!attendance?.check_in_at) {
    const isPending = Boolean(attendance?.work_date && !isDutyEndedForDate(attendance.work_date, settings));
    if (isPending || attendance?.status === "Pending") {
      return {
        isPresent: false,
        isLate: false,
        isHalfDay: false,
        isAbsent: false,
        isPending: true,
        displayStatuses: ["Pending"]
      };
    }

    return {
      isPresent: false,
      isLate: false,
      isHalfDay: false,
      isAbsent: true,
      isPending: false,
      displayStatuses: ["Absent"]
    };
  }

  const lateThreshold = parseTimeToMinutes(settings.late_threshold_time) ?? 0;
  const isLate = timeInZoneMinutes(attendance.check_in_at, settings.timezone) > lateThreshold;
  const halfDayThreshold = getHalfDayThresholdHours(settings);
  const isHalfDay =
    Boolean(attendance.check_out_at) &&
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
