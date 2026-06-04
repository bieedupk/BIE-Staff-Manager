import { PageHeader } from "@/components/ui/page-header";
import { requireEmployeeProfile } from "@/lib/auth";
import { departmentTextForProfile, fetchEmployeeDepartmentsByEmployee } from "@/lib/employee-departments";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function EmployeeProfilePage() {
  const profile = await requireEmployeeProfile();
  const supabase = await createClient();
  const assignmentsByEmployee = await fetchEmployeeDepartmentsByEmployee(supabase, [profile.id]);

  return (
    <>
      <PageHeader title="Profile" subtitle="Your profile information as stored by BIE administration." backHref="/employee/dashboard" />
      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <dl className="grid gap-4 md:grid-cols-2">
          <ProfileItem label="Full name" value={profile.full_name} />
          <ProfileItem label="Email" value={profile.email} />
          <ProfileItem label="Phone" value={profile.phone || "-"} />
          <ProfileItem label="Role" value={profile.role} />
          <ProfileItem label="Department" value={departmentTextForProfile(profile, assignmentsByEmployee, "-")} />
          <ProfileItem label="Designation" value={profile.designation || "-"} />
          <ProfileItem label="Joining date" value={formatDate(profile.joining_date)} />
          <ProfileItem label="Status" value={profile.status} />
        </dl>
      </section>
    </>
  );
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
