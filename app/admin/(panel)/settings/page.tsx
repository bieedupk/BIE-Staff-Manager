import { updateOfficeTimingSettings } from "@/app/actions/settings";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminProfile } from "@/lib/auth";
import { fetchEmployeeDepartmentText } from "@/lib/employee-departments";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { createClient } from "@/lib/supabase/server";
import { isAdminManagerRole } from "@/lib/utils";

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{
    office_settings_success?: string;
    office_settings_error?: string;
  }>;
}) {
  const profile = await requireAdminProfile();
  const supabase = await createClient();
  const departmentText = await fetchEmployeeDepartmentText(supabase, profile);
  const settings = await getOrganizationSettings();
  const resolvedSearchParams = await searchParams;
  const canUpdateOfficeTiming = isAdminManagerRole(profile.role);

  return (
    <>
      <PageHeader title="Settings" subtitle="Phase 1 keeps settings simple and focused." backHref="/admin/dashboard" />
      <SettingsMessage success={resolvedSearchParams?.office_settings_success} error={resolvedSearchParams?.office_settings_error} />
      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">Account</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="font-bold text-slate-500">Name</dt>
            <dd className="font-semibold text-slate-950">{profile.full_name}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">Role</dt>
            <dd className="font-semibold text-slate-950">{profile.role}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">Department</dt>
            <dd className="font-semibold text-slate-950">{departmentText}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">Status</dt>
            <dd className="font-semibold text-slate-950">{profile.status}</dd>
          </div>
        </dl>
      </section>
      <section className="mt-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">Office Timing</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          These settings power admin timing display. Attendance check-in and check-out continue to use server time.
        </p>
        {canUpdateOfficeTiming ? (
          <form action={updateOfficeTimingSettings} className="mt-4 grid gap-3 md:grid-cols-2">
            <TimeInput name="office_start_time" label="Office start time" defaultValue={timeInputValue(settings.office_start_time)} />
            <TimeInput name="office_end_time" label="Office end time" defaultValue={timeInputValue(settings.office_end_time)} />
            <TimeInput name="late_threshold_time" label="Late After Time" defaultValue={timeInputValue(settings.late_threshold_time)} />
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Timezone
              <input
                name="timezone"
                defaultValue={settings.timezone}
                required
                className="min-h-11 rounded-lg border border-slate-300 px-3"
              />
            </label>
            <div className="md:col-span-2">
              <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Save Office Timing</button>
            </div>
          </form>
        ) : (
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <SettingValue label="Office start time" value={timeInputValue(settings.office_start_time)} />
            <SettingValue label="Office end time" value={timeInputValue(settings.office_end_time)} />
            <SettingValue label="Late After Time" value={timeInputValue(settings.late_threshold_time)} />
            <SettingValue label="Timezone" value={settings.timezone} />
          </dl>
        )}
      </section>
    </>
  );
}

function TimeInput({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-700">
      {label}
      <input name={name} type="time" defaultValue={defaultValue} required className="min-h-11 rounded-lg border border-slate-300 px-3" />
    </label>
  );
}

function SettingValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function timeInputValue(value: string) {
  return value.slice(0, 5);
}

function SettingsMessage({ success, error }: { success?: string; error?: string }) {
  if (success) {
    return <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{success}</div>;
  }

  if (error) {
    return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>;
  }

  return null;
}
