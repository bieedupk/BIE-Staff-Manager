import type { AttendanceStatus, EmployeeStatus, LeaveStatus, OrganizationSettings, TaskPriority, TaskStatus, UserRole } from "@/lib/types";

export const adminRoles: UserRole[] = ["super_admin", "admin", "supervisor"];

export function isAdminRole(role?: string | null) {
  return role === "super_admin" || role === "admin" || role === "supervisor";
}

export function isAdminManagerRole(role?: string | null) {
  return role === "super_admin" || role === "admin";
}

export function roleLabel(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatTime(value?: string | null, timezone: string = "Asia/Karachi") {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone || "Asia/Karachi"
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Karachi"
    }).format(date);
  }
}

function karachiDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);

  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";

  return {
    year: part("year"),
    month: part("month"),
    day: part("day")
  };
}

export function todayISO() {
  const { year, month, day } = karachiDateParts(new Date());
  return `${year}-${month}-${day}`;
}

export function todayISOInTimezone(timezone?: string, date = new Date()): string {
  if (!timezone) return todayISO();
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
    return y && m && d ? `${y}-${m}-${d}` : todayISO();
  } catch {
    return todayISO();
  }
}

export function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const trimmed = timeStr.trim();
  if (!trimmed) return null;

  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridiem = match12[4]?.toUpperCase();
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  const [h, m] = trimmed.split(":");
  const hours = parseInt(h, 10);
  const minutes = parseInt(m, 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export function getOrgCurrentTimeMinutes(timezone?: string, date = new Date()): number {
  const tz = timezone || "Asia/Karachi";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);
    const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
    const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";
    let hour = parseInt(hourStr, 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(minuteStr, 10);
    return hour * 60 + minute;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

export function getOrgCurrentTimeHHMM(timezone?: string, date = new Date()): string {
  const totalMinutes = getOrgCurrentTimeMinutes(timezone, date);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isOfficeHoursEnded(
  settings: Pick<OrganizationSettings, "office_end_time" | "timezone">,
  date = new Date()
): boolean {
  const currentMinutes = getOrgCurrentTimeMinutes(settings?.timezone, date);
  const officeEndMinutes = parseTimeToMinutes(settings?.office_end_time);
  if (officeEndMinutes === null) return true;
  return currentMinutes >= officeEndMinutes;
}

export function isDutyEndedForDate(
  workDate: string,
  settings: Pick<OrganizationSettings, "office_end_time" | "timezone">,
  now = new Date()
): boolean {
  const orgToday = todayISOInTimezone(settings?.timezone, now);
  if (workDate < orgToday) {
    return true;
  }
  if (workDate > orgToday) {
    return false;
  }
  return isOfficeHoursEnded(settings, now);
}

export function getHalfDayThresholdHours(
  settings?: Pick<OrganizationSettings, "office_start_time" | "office_end_time">
): number {
  if (!settings?.office_start_time || !settings?.office_end_time) {
    return 4.0;
  }
  const startMins = parseTimeToMinutes(settings.office_start_time);
  const endMins = parseTimeToMinutes(settings.office_end_time);
  if (startMins === null || endMins === null || endMins <= startMins) {
    return 4.0;
  }
  const dutyDurationHours = (endMins - startMins) / 60;
  return dutyDurationHours / 2;
}

export function monthStartISO() {
  const { year, month } = karachiDateParts(new Date());
  return `${year}-${month}-01`;
}


export function formatDurationMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(Number(totalMinutes))) {
    return "-";
  }

  const mins = Math.max(Math.round(Number(totalMinutes)), 0);
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;

  if (hours === 0) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const hourPart = `${hours} ${hours === 1 ? "hour" : "hours"}`;

  if (minutes === 0) {
    return hourPart;
  }

  const minutePart = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return `${hourPart} ${minutePart}`;
}

export function formatWorkedDuration(hours: number | string | null | undefined): string {
  if (hours === null || hours === undefined || hours === "") {
    return "-";
  }

  const num = typeof hours === "number" ? hours : Number(hours);
  if (Number.isNaN(num)) {
    return "-";
  }

  return formatDurationMinutes(Math.round(num * 60));
}

export function formatDecimalHours(
  value: number | string | null | undefined,
  options?: { withUnit?: boolean }
): string {
  if (value === null || value === undefined || value === "") {
    return options?.withUnit === false ? "" : "-";
  }

  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) {
    return options?.withUnit === false ? "" : "-";
  }

  const rounded = Math.round(num * 100) / 100;
  const formattedNumber = String(Number(rounded.toFixed(2)));

  if (options?.withUnit === false) {
    return formattedNumber;
  }

  const unit = rounded === 1 ? "hour" : "hours";
  return `${formattedNumber} ${unit}`;
}


export function hoursBetween(start: string, end = new Date()) {
  const diff = end.getTime() - new Date(start).getTime();
  return Math.max(Number((diff / 36e5).toFixed(2)), 0);
}

export function attendanceStatusClass(status: AttendanceStatus | "Not Checked In" | "Checked In" | "Attendance Completed" | string) {
  if (status === "Present" || status === "Checked In" || status === "Attendance Completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "Late" || status === "Half Day") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "Absent") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}

export function taskStatusClass(status: TaskStatus) {
  if (status === "Completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "In Progress") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (status === "Overdue") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

export function leaveStatusClass(status: LeaveStatus) {
  if (status === "Approved") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "Rejected") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

export function employeeStatusClass(status: EmployeeStatus) {
  if (status === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-slate-100 text-slate-700 ring-slate-300";
}

export function priorityClass(priority: TaskPriority) {
  if (priority === "Urgent") return "bg-red-50 text-red-700 ring-red-200";
  if (priority === "High") return "bg-orange-50 text-orange-700 ring-orange-200";
  if (priority === "Medium") return "bg-blue-50 text-blue-700 ring-blue-200";
  return "bg-slate-50 text-slate-700 ring-slate-200";
}
