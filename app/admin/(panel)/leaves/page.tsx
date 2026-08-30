import { reviewLeave } from "@/app/actions/leaves";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient } from "@/lib/supabase/server";
import type { LeaveRequest } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default async function AdminLeavesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select("*, profiles(full_name, department)")
    .order("created_at", { ascending: false });
  const leaves = (data ?? []) as LeaveRequest[];

  return (
    <>
      <PageHeader title="Leave Requests" subtitle="Approve or reject leave requests and add an office comment." backHref="/admin/dashboard" />
      <section className="grid gap-4">
        {leaves.length ? (
          leaves.map((leave) => (
            <article key={leave.id} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-extrabold text-slate-950">{leave.profiles?.full_name}</h2>
                  <p className="text-sm font-medium text-slate-500">
                    {leave.leave_type} · {formatDate(leave.from_date)} to {formatDate(leave.to_date)}
                  </p>
                </div>
                <StatusBadge tone="leave">{leave.status}</StatusBadge>
              </div>
              <p className="mt-3 text-sm text-slate-700">{leave.reason}</p>
              {leave.admin_comment ? <p className="mt-2 text-sm font-medium text-slate-600">Comment: {leave.admin_comment}</p> : null}
              {leave.status === "Pending" ? (
                <form action={reviewLeave} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <input type="hidden" name="id" value={leave.id} />
                  <input name="admin_comment" placeholder="Admin comment" className="min-h-11 rounded-lg border border-slate-300 px-3" />
                  <SubmitButton name="status" value="Approved" pendingText="Approving..." className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white transition hover:bg-bie-800 disabled:opacity-50">
                    Approve
                  </SubmitButton>
                  <SubmitButton name="status" value="Rejected" pendingText="Rejecting..." className="min-h-11 rounded-lg border border-red-200 px-4 font-extrabold text-red-700 transition hover:bg-red-50 disabled:opacity-50">
                    Reject
                  </SubmitButton>
                </form>
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
