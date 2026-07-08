import { updateOfficeTimingSettings, updateWelcomeEmailTemplate } from "@/app/actions/settings";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdminProfile } from "@/lib/auth";
import { fetchEmployeeDepartmentText } from "@/lib/employee-departments";
import { getWelcomeEmailTemplate } from "@/lib/email/templates";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { createClient } from "@/lib/supabase/server";
import { isAdminManagerRole } from "@/lib/utils";

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{
    office_settings_success?: string;
    office_settings_error?: string;
    email_template_success?: string;
    email_template_error?: string;
  }>;
}) {
  const profile = await requireAdminProfile();
  const supabase = await createClient();
  const departmentText = await fetchEmployeeDepartmentText(supabase, profile);
  const settings = await getOrganizationSettings();
  const welcomeTemplate = await getWelcomeEmailTemplate();
  const resolvedSearchParams = await searchParams;
  const canUpdateOfficeTiming = isAdminManagerRole(profile.role);

  return (
    <>
      <PageHeader title="Settings" subtitle="Phase 1 keeps settings simple and focused." backHref="/admin/dashboard" />
      <SettingsMessage success={resolvedSearchParams?.office_settings_success} error={resolvedSearchParams?.office_settings_error} />
      <SettingsMessage success={resolvedSearchParams?.email_template_success} error={resolvedSearchParams?.email_template_error} />
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
      <section className="mt-5 rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <h2 className="font-extrabold text-slate-950">Email Templates</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Welcome email content sent after an admin creates a staff account.
        </p>
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <strong className="block mb-1">Available placeholders</strong>
          <ul className="list-disc ml-5 space-y-1">
            <li>{"{{employee_name}}"}</li>
            <li>{"{{designation}}"}</li>
            <li>{"{{departments}}"}</li>
            <li>{"{{email}}"}</li>
            <li>{"{{setup_link}}"}</li>
            <li>{"{{contact_email}}"}</li>
            <li>{"{{contact_phone}}"}</li>
            <li>{"{{contact_address}}"}</li>
            <li>{"{{organization_name}}"}</li>
          </ul>
          <p className="mt-2 text-xs text-slate-600">Use the secure setup link (<em>{"{{setup_link}}"}</em>) instead of sending passwords in plain text.</p>
        </div>
        {canUpdateOfficeTiming ? (
          <form action={updateWelcomeEmailTemplate} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Welcome email subject
              <input
                name="subject"
                defaultValue={welcomeTemplate.subject}
                required
                className="min-h-11 rounded-lg border border-slate-300 px-3"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Welcome email body text
              <textarea
                name="body_text"
                defaultValue={welcomeTemplate.body_text}
                required
                rows={12}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <Input name="contact_email" label="Contact email" defaultValue={welcomeTemplate.contact_email ?? ""} />
              <Input name="contact_phone" label="Contact phone" defaultValue={welcomeTemplate.contact_phone ?? ""} />
            </div>
            <label className="grid gap-1 text-sm font-bold text-slate-700">
              Contact address
              <textarea
                name="contact_address"
                defaultValue={welcomeTemplate.contact_address ?? ""}
                rows={3}
                className="rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <div>
              <button className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white">Save Email Template</button>
            </div>
          </form>
        ) : (
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <SettingValue label="Welcome email subject" value={welcomeTemplate.subject} />
            <SettingValue label="Contact email" value={welcomeTemplate.contact_email || "-"} />
            <SettingValue label="Contact phone" value={welcomeTemplate.contact_phone || "-"} />
            <SettingValue label="Contact address" value={welcomeTemplate.contact_address || "-"} />
          </dl>
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
