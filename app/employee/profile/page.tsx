import { DepartmentBadges } from "@/components/common/department-badges";
import { ProfilePhotoEditor } from "@/components/employee/profile-photo-editor";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireEmployeeProfile } from "@/lib/auth";
import { getAvatarSignedUrl } from "@/lib/avatar";
import { getEmployeeDepartmentNames } from "@/lib/employee-departments";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, roleLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeeProfilePage() {
  const profile = await requireEmployeeProfile();

  const [departments, avatarUrl, supervisorName] = await Promise.all([
    getEmployeeDepartmentNames(profile.id, profile.department),
    getAvatarSignedUrl(profile.avatar_path),
    resolveSupervisorName(profile.supervisor_id)
  ]);

  return (
    <>
      <PageHeader
        title="My Profile"
        subtitle="View your staff profile details and manage your profile picture."
        backHref="/employee/dashboard"
      />

      <div className="grid gap-5">
        {/* Profile Picture Management Card */}
        <ProfilePhotoEditor initialAvatarUrl={avatarUrl} fullName={profile.full_name} />

        {/* Profile Details (Read-only for employee) */}
        <section className="rounded-lg border border-emerald-100 bg-white p-5 shadow-soft">
          <div className="flex flex-col gap-1 border-b border-emerald-100 pb-4">
            <h2 className="text-base font-extrabold text-slate-950">Employee Information</h2>
            <p className="text-xs font-medium text-slate-500">
              Personal and organizational details as registered by BIE administration.
            </p>
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold tracking-wider text-slate-400 uppercase">
                Personal & Contact
              </h3>
              <dl className="grid gap-3">
                <ProfileItem label="Full name" value={profile.full_name} />
                <ProfileItem label="Father's name" value={profile.father_name || "-"} />
                <ProfileItem label="Email" value={profile.email} />
                <ProfileItem label="Phone" value={profile.phone || "-"} />
                <ProfileItem label="Joining date" value={formatDate(profile.joining_date)} />
                <ProfileItem label="System entry date" value={formatDate(profile.system_entry_date)} />
                <ProfileItem label="Off-day plan" value={{ weekly_friday: "Friday off every week", monthly_four: "Four days after one month (request dates)", bimonthly_eight: "Eight days after two months (request dates)", unspecified: "Not set" }[profile.attendance_schedule]} />
              </dl>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-extrabold tracking-wider text-slate-400 uppercase">
                Organization & Role
              </h3>
              <dl className="grid gap-3">
                <ProfileItem
                  label="Role"
                  value={<StatusBadge tone="neutral">{roleLabel(profile.role)}</StatusBadge>}
                />
                <ProfileItem
                  label="Status"
                  value={<StatusBadge tone="employee">{roleLabel(profile.status)}</StatusBadge>}
                />
                {profile.employee_type ? (
                  <ProfileItem label="Employee Type" value={profile.employee_type} />
                ) : null}
                <ProfileItem
                  label="Departments"
                  value={<DepartmentBadges departments={departments} />}
                />
                <ProfileItem label="Designation" value={profile.designation || "-"} />
                <ProfileItem label="Supervisor" value={supervisorName || "No supervisor assigned"} />
              </dl>
            </div>

            {profile.responsibilities ? (
              <div className="space-y-2 md:col-span-2">
                <h3 className="text-xs font-extrabold tracking-wider text-slate-400 uppercase">
                  Responsibilities
                </h3>
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm font-medium leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {profile.responsibilities}
                </p>
              </div>
            ) : null}
          </div>
        </section>
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
