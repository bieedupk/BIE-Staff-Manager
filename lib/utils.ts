import type { AttendanceStatus, EmployeeStatus, LeaveStatus, TaskPriority, TaskStatus, UserRole } from "@/lib/types";

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

export function monthStartISO() {
  const { year, month } = karachiDateParts(new Date());
  return `${year}-${month}-01`;
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
