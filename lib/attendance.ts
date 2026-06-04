import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceRecord, OrganizationSettings } from "@/lib/types";

const existingHalfDayThresholdHours = 4;

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

export function attendanceDisplayStatus(attendance: AttendanceRecord | null) {
  if (!attendance) return "Not Checked In";
  if (attendance.check_out_at) return "Attendance Completed";
  return "Checked In";
}

export type AttendanceFlags = {
  isPresent: boolean;
  isLate: boolean;
  isHalfDay: boolean;
  isAbsent: boolean;
  displayStatuses: Array<"Present" | "Late" | "Half Day" | "Absent">;
};

export function deriveAttendanceFlags(
  attendance: Pick<AttendanceRecord, "check_in_at" | "check_out_at" | "total_hours"> | null | undefined,
  settings: Pick<OrganizationSettings, "timezone" | "late_threshold_time" | "office_start_time" | "office_end_time">
): AttendanceFlags {
  if (!attendance?.check_in_at) {
    return {
      isPresent: false,
      isLate: false,
      isHalfDay: false,
      isAbsent: true,
      displayStatuses: ["Absent"]
    };
  }

  const isPresent = true;
  const isLate = timeInZoneMinutes(attendance.check_in_at, settings.timezone) > timeValueMinutes(settings.late_threshold_time);
  // Keep this aligned with the existing checkout RPC, which marks Half Day when worked hours are below 4.
  const isHalfDay =
    Boolean(attendance.check_out_at) &&
    attendance.total_hours !== null &&
    Number(attendance.total_hours) < existingHalfDayThresholdHours;
  const displayStatuses: AttendanceFlags["displayStatuses"] = ["Present"];

  if (isLate) displayStatuses.push("Late");
  if (isHalfDay) displayStatuses.push("Half Day");

  return {
    isPresent,
    isLate,
    isHalfDay,
    isAbsent: false,
    displayStatuses
  };
}

function timeValueMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function timeInZoneMinutes(value: string, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone
    }).formatToParts(new Date(value));
    const hours = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return hours * 60 + minutes;
  } catch {
    const date = new Date(value);
    return date.getHours() * 60 + date.getMinutes();
  }
}
