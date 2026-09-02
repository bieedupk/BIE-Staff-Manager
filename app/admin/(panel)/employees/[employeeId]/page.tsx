import { notFound } from "next/navigation";
import Link from "next/link";
import { ProfileTabs } from "@/components/admin/profile-tabs";
import { DepartmentBadges } from "@/components/common/department-badges";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminProfile } from "@/lib/auth";
import { getAvatarSignedUrl } from "@/lib/avatar";
import { getEmployeeDepartmentNames, fetchEmployeeDepartmentsByEmployee } from "@/lib/employee-departments";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import { formatDate, roleLabel } from "@/lib/utils";
import { EditEmployeeForm } from "@/components/admin/edit-employee-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminEmployeeProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<{ edit?: string }>;
}) {
  const currentProfile = await requireAdminProfile();
  const { employeeId } = await params;
  const resolvedSearchParams = await searchParams;
  const isEditMode = resolvedSearchParams?.edit === "true";

  const supabase = createAdminClient();
  const { data: employee, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", employeeId)
    .single<Profile>();

  if (error || !employee) {
    notFound();
  }

  const [departments, avatarUrl, supervisorName] = await Promise.all([
    getEmployeeDepartmentNames(employee.id, employee.department),
    getAvatarSignedUrl(employee.avatar_path),
    resolveSupervisorName(employee.supervisor_id)
  ]);

  let activeDepartments: any[] = [];
  let assignmentsByEmployee = new Map();
  let supervisors: any[] = [];

  if (isEditMode) {
    const [{ data: depts }, { data: profiles }, assignments] = await Promise.all([
      supabase.from("departments").select("*").eq("is_active", true).order("sort_order", { ascending: true, nullsFirst: false }).order("name"),
      supabase.from("profiles").select("id, full_name, role").in("role", ["super_admin", "admin", "supervisor"]),
      fetchEmployeeDepartmentsByEmployee(supabase, [employee.id])
    ]);
    activeDepartments = depts ?? [];
    supervisors = profiles ?? [];
    assignmentsByEmployee = assignments;
  }

  return (
    <>
      <PageHeader
        title={isEditMode ? "Edit Employee" : "Employee Profile"}
        subtitle={isEditMode ? `Modify details and assignments for ${employee.full_name}.` : `Staff profile details and organizational assignments for ${employee.full_name}.`}
        backHref="/admin/employees"
        action={
          !isEditMode ? (
            <Link
              href={`/admin/employees/${employee.id}?edit=true`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-bie-700 px-4 text-sm font-extrabold text-white shadow-soft transition hover:bg-bie-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
              Edit Employee
            </Link>
          ) : null
        }
      />

      <div className="grid gap-6">
        {/* Profile Header Card */}
        <section className="rounded-lg border border-emerald-100 bg-white p-6 shadow-soft">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <Avatar src={avatarUrl} name={employee.full_name} size="2xl" />

            <div className="flex min-w-0 flex-1 flex-col items-center text-center sm:items-start sm:text-start">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1 className="text-2xl font-extrabold text-slate-950">{employee.full_name}</h1>
                {employee.employee_type ? (
                  <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {employee.employee_type}
                  </span>
                ) : null}
              </div>

              {employee.designation ? (
                <p className="mt-1 text-sm font-semibold text-slate-700">{employee.designation}</p>
              ) : null}

              <p className="text-sm font-medium text-slate-500">{employee.email}</p>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <StatusBadge>{roleLabel(employee.role)}</StatusBadge>
                <StatusBadge tone="employee">{roleLabel(employee.status)}</StatusBadge>
                <DepartmentBadges departments={departments} />
              </div>
            </div>
          </div>
        </section>

        {!isEditMode && (
          <ProfileTabs employeeId={employee.id} activeTab="overview" />
        )}

        {isEditMode ? (
          <section className="rounded-lg border border-emerald-100 bg-white p-6 shadow-soft">
            <EditEmployeeForm
              employee={employee}
              activeDepartments={activeDepartments}
              assignmentsByEmployee={assignmentsByEmployee}
              supervisors={supervisors}
            />
          </section>
        ) : (
          <section className="grid gap-5 md:grid-cols-2">
            {/* Personal & Contact Details */}
            <div className="rounded-lg border border-emerald-100 bg-white p-5 shadow-soft">
              <h2 className="border-b border-emerald-100 pb-3 text-sm font-extrabold tracking-wider text-slate-400 uppercase">
                Personal & Contact
              </h2>
              <dl className="mt-4 grid gap-3.5">
                <ProfileItem label="Full name" value={employee.full_name} />
                <ProfileItem label="Email" value={employee.email} />
                <ProfileItem label="Phone" value={employee.phone || "-"} />
                <ProfileItem label="Joining date" value={formatDate(employee.joining_date)} />
              </dl>
            </div>

            {/* Organization & Role Details */}
            <div className="rounded-lg border border-emerald-100 bg-white p-5 shadow-soft">
              <h2 className="border-b border-emerald-100 pb-3 text-sm font-extrabold tracking-wider text-slate-400 uppercase">
                Organization & Role
              </h2>
              <dl className="mt-4 grid gap-3.5">
                <ProfileItem
                  label="Role"
                  value={<StatusBadge tone="neutral">{roleLabel(employee.role)}</StatusBadge>}
                />
                <ProfileItem
                  label="Status"
                  value={<StatusBadge tone="employee">{roleLabel(employee.status)}</StatusBadge>}
                />
                {employee.employee_type ? (
                  <ProfileItem label="Employee Type" value={employee.employee_type} />
                ) : null}
                <ProfileItem
                  label="Departments"
                  value={<DepartmentBadges departments={departments} />}
                />
                <ProfileItem label="Designations" value={employee.designation || "-"} />
                <ProfileItem
                  label="Supervisor"
                  value={supervisorName || "No supervisor assigned"}
                />
              </dl>
            </div>

            {/* Responsibilities */}
            {employee.responsibilities ? (
              <div className="rounded-lg border border-emerald-100 bg-white p-5 shadow-soft md:col-span-2">
                <h2 className="border-b border-emerald-100 pb-3 text-sm font-extrabold tracking-wider text-slate-400 uppercase">
                  Responsibilities
                </h2>
                <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {employee.responsibilities}
                </p>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </>
  );
}

async function resolveSupervisorName(supervisorId: string | null): Promise<string | null> {
  if (!supervisorId) return null;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", supervisorId)
      .single();

    return data?.full_name ?? null;
  } catch {
    return null;
  }
}

function ProfileItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
