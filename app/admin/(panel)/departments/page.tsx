import { createDepartment, updateDepartment } from "@/app/actions/admin";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminManagerProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Department } from "@/lib/types";

export default async function AdminDepartmentsPage() {
  await requireAdminManagerProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("*").order("name");
  const departments = (data ?? []) as Department[];

  return (
    <>
      <PageHeader title="Departments" subtitle="Simple department list used for employee and task organization." backHref="/admin/dashboard" />
      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <form action={createDepartment} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input name="name" placeholder="Department name" required className="min-h-11 rounded-lg border border-slate-300 px-3" />
          <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Add department</button>
        </form>
      </section>

      <section className="mt-5 grid gap-3">
        {departments.length ? (
          departments.map((department) => (
            <form key={department.id} action={updateDepartment} className="grid gap-3 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft sm:grid-cols-[1fr_auto_auto]">
              <input type="hidden" name="id" value={department.id} />
              <input name="name" defaultValue={department.name} className="min-h-11 rounded-lg border border-slate-300 px-3" />
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="is_active" defaultChecked={department.is_active} />
                Active
              </label>
              <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Save</button>
            </form>
          ))
        ) : (
          <EmptyState message="No departments found." />
        )}
      </section>
    </>
  );
}
