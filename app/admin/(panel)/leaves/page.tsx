import { reviewLeave, updateLeaveDates, endLeaveNow } from "@/app/actions/leaves";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import type { LeaveRequest } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type EmployeeProfileSummary = {
  id: string;
  full_name: string;
  designation: string | null;
  department: string | null;
  department_id: string | null;
};

type RawLeaveRequest = Omit<LeaveRequest, "employee_profile"> & {
  employee_profile: EmployeeProfileSummary | EmployeeProfileSummary[] | null;
};

export default async function AdminLeavesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*, employee_profile:profiles!leave_requests_employee_id_fkey(id, full_name, designation, department, department_id)")
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

  return (
    <>
      <PageHeader title="Leave Requests" subtitle="Approve or reject leave requests and add an office comment." backHref="/admin/dashboard" />
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
