import { applyLeave } from "@/app/actions/leaves";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireEmployeeProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LeaveRequest } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const leaveTypes = ["Casual", "Sick", "Annual", "Emergency", "Other"];

export default async function EmployeeLeavePage() {
  const profile = await requireEmployeeProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("employee_id", profile.id)
    .order("created_at", { ascending: false });
  const leaves = (data ?? []) as LeaveRequest[];

  return (
    <>
      <PageHeader title="Leave" subtitle="Apply for leave and see approval status." backHref="/employee/dashboard" />
      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">Apply for Leave</h2>
        <form action={applyLeave} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Leave type
            <select name="leave_type" className="min-h-11 rounded-lg border border-slate-300 px-3">
              {leaveTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <Input name="from_date" label="From date" type="date" required />
          <Input name="to_date" label="To date" type="date" required />
          <label className="grid gap-1 text-sm font-bold text-slate-700 md:col-span-2">
            Reason
            <textarea name="reason" required className="rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="md:col-span-2">
            <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Submit leave request</button>
          </div>
        </form>
      </section>

      <section className="mt-5 grid gap-3">
        {leaves.length ? (
          leaves.map((leave) => (
            <article key={leave.id} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-extrabold text-slate-950">{leave.leave_type}</h2>
                  <p className="text-sm font-medium text-slate-500">
                    {formatDate(leave.from_date)} to {formatDate(leave.to_date)}
                  </p>
                </div>
                <StatusBadge tone="leave">{leave.status}</StatusBadge>
              </div>
              <p className="mt-3 text-sm text-slate-700">{leave.reason}</p>
              {leave.admin_comment ? <p className="mt-2 text-sm font-medium text-slate-600">Admin comment: {leave.admin_comment}</p> : null}
            </article>
          ))
        ) : (
          <EmptyState message="No leave requests yet." />
        )}
      </section>
    </>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, ...inputProps } = props;
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700">
      {label}
      <input {...inputProps} className="min-h-11 rounded-lg border border-slate-300 px-3" />
    </label>
  );
}
