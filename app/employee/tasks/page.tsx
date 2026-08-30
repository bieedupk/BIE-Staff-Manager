import { updateMyTaskStatus } from "@/app/actions/tasks";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireEmployeeProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Task, TaskStatus } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/utils";

const statuses: TaskStatus[] = ["Pending", "In Progress", "Completed"];

export default async function EmployeeTasksPage() {
  const profile = await requireEmployeeProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("*").eq("assigned_to", profile.id).order("due_date");
  const tasks = (data ?? []) as Task[];
  const today = todayISO();

  return (
    <>
      <PageHeader title="Tasks" subtitle="View assigned tasks, add progress notes, and mark completed work." backHref="/employee/dashboard" />
      <section className="grid gap-4">
        {tasks.length ? (
          tasks.map((task) => {
            const overdue = task.status !== "Completed" && task.due_date < today;
            return (
              <article key={task.id} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-extrabold text-slate-950">{task.title}</h2>
                    <p className="text-sm font-medium text-slate-500">
                      Due {formatDate(task.due_date)} · {task.department}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone="task">{overdue ? "Overdue" : task.status}</StatusBadge>
                    <StatusBadge tone="priority">{task.priority}</StatusBadge>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-700">{task.description}</p>
                {task.progress_note ? <p className="mt-2 text-sm text-slate-600">Progress: {task.progress_note}</p> : null}
                {task.completion_note ? <p className="mt-2 text-sm text-slate-600">Completion: {task.completion_note}</p> : null}
                <form action={updateMyTaskStatus} className="mt-4 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="task_id" value={task.id} />
                  <label className="grid gap-1 text-sm font-bold text-slate-700">
                    Status
                    <select name="status" defaultValue={task.status === "Overdue" ? "In Progress" : task.status} className="min-h-11 rounded-lg border border-slate-300 px-3">
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-700">
                    Progress note
                    <input name="progress_note" defaultValue={task.progress_note ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3" />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-700 md:col-span-2">
                    Completion note
                    <textarea name="completion_note" defaultValue={task.completion_note ?? ""} className="rounded-lg border border-slate-300 px-3 py-2" />
                  </label>
                  <div className="md:col-span-2">
                    <SubmitButton pendingText="Updating task..." className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white transition hover:bg-bie-800 disabled:opacity-50">
                      Update task
                    </SubmitButton>
                  </div>
                </form>
              </article>
            );
          })
        ) : (
          <EmptyState message="No assigned tasks yet." />
        )}
      </section>
    </>
  );
}
