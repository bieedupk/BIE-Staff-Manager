import { assignTask } from "@/app/actions/tasks";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/server";
import type { Department, Profile, Task, TaskPriority, TaskStatus } from "@/lib/types";
import { formatDate, todayISO } from "@/lib/utils";

const priorities: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
const buckets: (TaskStatus | "Overdue")[] = ["Pending", "In Progress", "Completed", "Overdue"];

export default async function AdminTasksPage() {
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: tasks }, { data: employees }, { data: departments }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, assignee:profiles!tasks_assigned_to_fkey(full_name, department), assigner:profiles!tasks_assigned_by_fkey(full_name)")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("*").eq("role", "employee").eq("status", "active").order("full_name"),
    supabase.from("departments").select("*").eq("is_active", true).order("name")
  ]);

  const taskList = (tasks ?? []) as Task[];
  const staff = (employees ?? []) as Profile[];
  const departmentList = (departments ?? []) as Department[];

  function taskBucket(status: TaskStatus | "Overdue") {
    if (status === "Overdue") {
      return taskList.filter((task) => task.status !== "Completed" && task.due_date < today);
    }
    return taskList.filter((task) => task.status === status);
  }

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Assign staff work and monitor pending, in-progress, completed, and overdue tasks."
        backHref="/admin/dashboard"
      />

      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">Assign Task</h2>
        <form action={assignTask} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input name="title" label="Title" required />
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Assigned employee
            <select name="assigned_to" required className="min-h-11 rounded-lg border border-slate-300 px-3">
              {staff.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>
          <Input name="due_date" label="Due date" type="date" required />
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Priority
            <select name="priority" className="min-h-11 rounded-lg border border-slate-300 px-3">
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700">
            Department
            <select name="department" className="min-h-11 rounded-lg border border-slate-300 px-3">
              {departmentList.map((department) => (
                <option key={department.id} value={department.name}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700 md:col-span-2 xl:col-span-3">
            Description
            <textarea name="description" required className="rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="md:col-span-2 xl:col-span-3">
            <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Assign task</button>
          </div>
        </form>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        {buckets.map((bucket) => {
          const list = taskBucket(bucket);
          return (
            <div key={bucket} className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
              <h2 className="font-extrabold text-slate-950">{bucket} Tasks</h2>
              <div className="mt-4 grid gap-3">
                {list.length ? (
                  list.map((task) => <TaskCard key={task.id} task={task} overdue={task.status !== "Completed" && task.due_date < today} />)
                ) : (
                  <EmptyState message={`No ${bucket.toLowerCase()} tasks found.`} />
                )}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

function TaskCard({ task, overdue }: { task: Task; overdue: boolean }) {
  return (
    <article className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-extrabold text-slate-950">{task.title}</h3>
          <p className="text-sm font-medium text-slate-500">
            {task.assignee?.full_name} · {task.department}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="task">{overdue ? "Overdue" : task.status}</StatusBadge>
          <StatusBadge tone="priority">{task.priority}</StatusBadge>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-700">{task.description}</p>
      <p className="mt-2 text-sm font-medium text-slate-500">Due: {formatDate(task.due_date)}</p>
      {task.progress_note ? <p className="mt-2 text-sm text-slate-600">Progress: {task.progress_note}</p> : null}
      {task.completion_note ? <p className="mt-2 text-sm text-slate-600">Completion: {task.completion_note}</p> : null}
    </article>
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
