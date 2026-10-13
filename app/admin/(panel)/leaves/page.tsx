import { reviewLeave, updateLeaveDates, endLeaveNow } from "@/app/actions/leaves";
import { EmptyState } from "@/components/ui/empty-state";
import { LeaveTypeSummary } from "@/components/leave-type-summary";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { getApprovedLeaveYearSummary } from "@/lib/leave-year-summary";
import { daysBetweenISO, rotationEligibilityDate, rotationPlan } from "@/lib/rotation-policy";
import type { AttendanceSchedule, LeaveRequest } from "@/lib/types";
import { formatDate, todayISOInTimezone } from "@/lib/utils";

type EmployeeProfileSummary = {
  id: string;
  full_name: string;
  designation: string | null;
  department: string | null;
  department_id: string | null;
  attendance_schedule: AttendanceSchedule;
  system_entry_date: string;
  schedule_effective_from: string;
};

type RawLeaveRequest = Omit<LeaveRequest, "employee_profile"> & {
  employee_profile: EmployeeProfileSummary | EmployeeProfileSummary[] | null;
};

export default async function AdminLeavesPage() {
  const supabase = await createClient();
  const settings = await getOrganizationSettings();
  const today = todayISOInTimezone(settings.timezone);
  const year = Number(today.slice(0, 4));
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*, employee_profile:profiles!leave_requests_employee_id_fkey(id, full_name, designation, department, department_id, attendance_schedule, system_entry_date, schedule_effective_from)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load leave requests:", error.message);
    return (
      <>
        <PageHeader title="Leave Requests" subtitle="Approve or reject leave requests and add an office comment." backHref="/admin/dashboard" />
        <section className="grid gap-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            Leave requests could not be loaded.
          </div>
        </section>
      </>
    );
  }

  const rawLeaves = (data ?? []) as RawLeaveRequest[];
  const leaves = rawLeaves.map((leave) => {
    let profile = leave.employee_profile;
    if (Array.isArray(profile)) {
      profile = profile[0] || null;
    }
    return {
      ...leave,
      employee_profile: profile
    } as LeaveRequest;
  });

  const leaveSummaryByEmployee = await getApprovedLeaveYearSummary(year, today);
  const employeesWithRequests = new Map<string, string>(leaves.filter((leave) => leave.employee_profile).map((leave): [string, string] => [leave.employee_id, leave.employee_profile!.full_name]));
  const approvedRotation = new Map<string, LeaveRequest>();
  for (const leave of leaves) {
    if (leave.leave_type !== "Rotation Off" || leave.status !== "Approved") continue;
    const previous = approvedRotation.get(leave.employee_id);
    if (!previous || leave.to_date > previous.to_date) approvedRotation.set(leave.employee_id, leave);
  }

  return (
    <>
      <PageHeader title="Leave Requests" subtitle="Approve or reject leave requests and add an office comment." backHref="/admin/dashboard" />
      {employeesWithRequests.size ? (
        <section className="mb-5 grid gap-3">
          {[...employeesWithRequests].sort((a, b) => a[1].localeCompare(b[1])).map(([employeeId, name]) => (
            <article key={employeeId} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
              <h2 className="mb-2 font-extrabold text-slate-950">{name}</h2>
              <LeaveTypeSummary year={year} counts={leaveSummaryByEmployee.get(employeeId) ?? []} />
            </article>
          ))}
        </section>
      ) : null}
      <section className="grid gap-4">
        {leaves.length ? (
          leaves.map((leave) => (
            <article key={leave.id} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-extrabold text-slate-950">
                    {leave.employee_profile ? leave.employee_profile.full_name : "Employee profile unavailable"}
                  </h2>
                  <p className="text-sm font-medium text-slate-600">
                    {leave.employee_profile
                      ? `${leave.employee_profile.designation ?? "Not specified"} · ${leave.employee_profile.department ?? "Not specified"}`
                      : "Not specified · Not specified"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {leave.leave_type} · {formatDate(leave.from_date)} to {formatDate(leave.to_date)}
                  </p>
                  {leave.leave_type === "Rotation Off" && leave.status === "Pending" ? (
                    <RotationEligibilityNotice leave={leave} lastApproved={approvedRotation.get(leave.employee_id)} today={today} />
                  ) : null}
                </div>
                <StatusBadge tone="leave">{leave.status}</StatusBadge>
              </div>
              <p className="mt-3 text-sm text-slate-700">{leave.reason}</p>
              {leave.admin_comment ? <p className="mt-2 text-sm font-medium text-slate-600">Comment: {leave.admin_comment}</p> : null}
              {leave.status === "Pending" ? (
                <div className="mt-4 grid gap-3">
                  <form action={updateLeaveDates} className="grid sm:grid-cols-[auto_auto_auto] gap-3 items-end">
                    <input type="hidden" name="id" value={leave.id} />
                    <label className="grid gap-1 text-sm font-bold text-slate-700">
                      From date
                      <input type="date" name="from_date" defaultValue={leave.from_date} required className="min-h-11 rounded-lg border border-slate-300 px-3" />
                    </label>
                    <label className="grid gap-1 text-sm font-bold text-slate-700">
                      To date
                      <input type="date" name="to_date" defaultValue={leave.to_date} required className="min-h-11 rounded-lg border border-slate-300 px-3" />
                    </label>
                    <SubmitButton pendingText="Saving..." className="min-h-11 rounded-lg bg-slate-800 px-4 font-extrabold text-white transition hover:bg-slate-900 disabled:opacity-50">
                      Save Dates
                    </SubmitButton>
                  </form>

                  <form action={reviewLeave} className="grid sm:grid-cols-[1fr_auto_auto] gap-3">
                    <input type="hidden" name="id" value={leave.id} />
                    <input name="admin_comment" placeholder="Admin comment" className="min-h-11 rounded-lg border border-slate-300 px-3" />
                    <SubmitButton name="status" value="Approved" pendingText="Approving..." className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white transition hover:bg-bie-800 disabled:opacity-50">
                      Approve
                    </SubmitButton>
                    <SubmitButton name="status" value="Rejected" pendingText="Rejecting..." className="min-h-11 rounded-lg border border-red-200 px-4 font-extrabold text-red-700 transition hover:bg-red-50 disabled:opacity-50">
                      Reject
                    </SubmitButton>
                  </form>
                </div>
              ) : leave.status === "Approved" ? (
                <div className="mt-4 grid gap-3">
                  <form action={updateLeaveDates} className="grid sm:grid-cols-[auto_auto_auto] gap-3 items-end">
                    <input type="hidden" name="id" value={leave.id} />
                    <label className="grid gap-1 text-sm font-bold text-slate-700">
                      From date
                      <input type="date" name="from_date" defaultValue={leave.from_date} required className="min-h-11 rounded-lg border border-slate-300 px-3" />
                    </label>
                    <label className="grid gap-1 text-sm font-bold text-slate-700">
                      To date
                      <input type="date" name="to_date" defaultValue={leave.to_date} required className="min-h-11 rounded-lg border border-slate-300 px-3" />
                    </label>
                    <SubmitButton pendingText="Saving..." className="min-h-11 rounded-lg bg-slate-800 px-4 font-extrabold text-white transition hover:bg-slate-900 disabled:opacity-50">
                      Save Dates
                    </SubmitButton>
                  </form>
                  <form action={endLeaveNow} className="flex justify-end">
                    <input type="hidden" name="id" value={leave.id} />
                    <SubmitButton pendingText="Ending..." className="min-h-11 rounded-lg border border-red-200 bg-red-50 px-4 font-extrabold text-red-700 transition hover:bg-red-100 disabled:opacity-50">
                      End Leave Now
                    </SubmitButton>
                  </form>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <EmptyState message="No leave requests found." />
        )}
      </section>
    </>
  );
}

function RotationEligibilityNotice({ leave, lastApproved, today }: {
  leave: LeaveRequest;
  lastApproved?: LeaveRequest;
  today: string;
}) {
  const profile = leave.employee_profile;
  const plan = rotationPlan(profile?.attendance_schedule);
  if (!profile?.system_entry_date || !profile.schedule_effective_from || !profile.attendance_schedule || !plan) {
    return <p className="mt-2 text-xs font-semibold text-amber-800">Rotation plan or start date unavailable; review manually.</p>;
  }

  const planStart = profile.system_entry_date > profile.schedule_effective_from
    ? profile.system_entry_date : profile.schedule_effective_from;
  const previous = lastApproved && lastApproved.to_date >= planStart && lastApproved.id !== leave.id ? lastApproved : null;
  const anchor = previous ? previous.to_date : planStart;
  const eligibleOn = rotationEligibilityDate(anchor, profile.attendance_schedule)!;
  const elapsed = Math.max(0, daysBetweenISO(anchor, today));
  const remaining = Math.max(0, daysBetweenISO(today, eligibleOn));
  const requestedDays = daysBetweenISO(leave.from_date, leave.to_date) + 1;
  const earlyRequest = today < eligibleOn;
  const earlyDates = leave.from_date < eligibleOn;
  const exceedsPlan = requestedDays > plan.days;

  return (
    <div className={`mt-2 rounded-lg border p-3 text-xs font-medium ${earlyRequest || earlyDates || exceedsPlan ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
      <p className="font-extrabold">Rotation plan: {plan.label} · Requested: {requestedDays} day(s) · Plan allowance: {plan.days} day(s)</p>
      <p className="mt-1">{previous ? `Last approved rotation ended ${formatDate(previous.to_date)}` : `Rotation count starts ${formatDate(planStart)}`} · {elapsed} day(s) elapsed · Next eligible: {formatDate(eligibleOn)}</p>
      {earlyRequest ? <p className="mt-1 font-bold">Eligibility date is {remaining} day(s) away.</p> : <p className="mt-1 font-bold">Eligibility date reached.</p>}
      {earlyDates ? <p className="mt-1 font-bold">Requested dates begin before the usual eligibility date.</p> : null}
      {exceedsPlan ? <p className="mt-1 font-bold">Requested block exceeds the usual {plan.days}-day allowance.</p> : null}
      <p className="mt-1">This is guidance for the reviewer; approval remains at the admin&apos;s discretion.</p>
    </div>
  );
}
