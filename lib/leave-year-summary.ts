import { createClient } from "@/lib/supabase/server";

export type LeaveTypeCount = { type: string; days: number; requests: number };

// Count only approved leave, independently of the employee's rotation plan.
// Pending, rejected and cancelled requests do not consume leave days.
export async function getApprovedLeaveYearSummary(year: number, throughDate: string, employeeId?: string): Promise<Map<string, LeaveTypeCount[]>> {
  const supabase = await createClient();
  const firstDay = `${year}-01-01`;
  const lastDay = throughDate < `${year}-12-31` ? throughDate : `${year}-12-31`;
  const counts = new Map<string, Map<string, { days: Set<string>; requests: number }>>();
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const baseQuery = supabase.from("leave_requests")
      .select("id, employee_id, leave_type, from_date, to_date")
      .eq("status", "Approved")
      .lte("from_date", lastDay)
      .gte("to_date", firstDay);
    const query = employeeId ? baseQuery.eq("employee_id", employeeId) : baseQuery;
    const { data, error } = await query.order("id").range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not load approved leave totals: ${error.message}`);

    for (const leave of data ?? []) {
      const start = leave.from_date < firstDay ? firstDay : leave.from_date;
      const end = leave.to_date > lastDay ? lastDay : leave.to_date;
      if (end < start) continue;
      const byType = counts.get(leave.employee_id) ?? new Map<string, { days: Set<string>; requests: number }>();
      const current = byType.get(leave.leave_type) ?? { days: new Set<string>(), requests: 0 };
      for (const date = new Date(`${start}T00:00:00Z`); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        current.days.add(date.toISOString().slice(0, 10));
      }
      current.requests += 1;
      byType.set(leave.leave_type, current);
      counts.set(leave.employee_id, byType);
    }

    if (!data || data.length < pageSize) break;
  }

  return new Map<string, LeaveTypeCount[]>([...counts].map(([id, byType]): [string, LeaveTypeCount[]] => [
    id,
    [...byType].map(([type, value]) => ({ type, days: value.days.size, requests: value.requests }))
      .sort((a, b) => a.type.localeCompare(b.type))
  ]));
}
