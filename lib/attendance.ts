import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceRecord } from "@/lib/types";

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
