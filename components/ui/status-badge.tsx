import type { AttendanceStatus, EmployeeStatus, LeaveStatus, TaskPriority, TaskStatus } from "@/lib/types";
import { attendanceStatusClass, employeeStatusClass, leaveStatusClass, priorityClass, taskStatusClass } from "@/lib/utils";

type Props = {
  children: AttendanceStatus | LeaveStatus | TaskStatus | TaskPriority | "Not Checked In" | string;
  tone?: "attendance" | "leave" | "task" | "priority" | "employee" | "neutral";
};

export function StatusBadge({ children, tone = "neutral" }: Props) {
  const value = String(children);
  let className = "bg-slate-50 text-slate-700 ring-slate-200";

  if (tone === "attendance") className = attendanceStatusClass(value as AttendanceStatus | "Not Checked In");
  if (tone === "leave") className = leaveStatusClass(value as LeaveStatus);
  if (tone === "task") className = taskStatusClass(value as TaskStatus);
  if (tone === "priority") className = priorityClass(value as TaskPriority);
  if (tone === "employee") className = employeeStatusClass(value.toLowerCase() as EmployeeStatus);

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${className}`}>
      {value}
    </span>
  );
}
