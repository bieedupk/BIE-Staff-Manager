import { AppShell } from "@/components/layout/app-shell";
import { requireAdminProfile } from "@/lib/auth";
import { fetchEmployeeDepartmentText } from "@/lib/employee-departments";
import { getLocale, t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { isAdminManagerRole } from "@/lib/utils";

const adminNav = [
  ["/admin/dashboard", "dashboard"],
  ["/admin/employees", "employees"],
  ["/admin/attendance", "attendance"],
  ["/admin/tasks", "tasks"],
  ["/admin/leaves", "leaves"],
  ["/admin/daily-reports", "dailyReports"],
  ["/admin/departments", "departments"],
  ["/admin/audit-logs", "auditLogs"],
  ["/admin/settings", "settings"]
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdminProfile();
  const locale = await getLocale();
  const supabase = await createClient();
  const departmentText = await fetchEmployeeDepartmentText(supabase, profile);
  const nav = isAdminManagerRole(profile.role)
    ? adminNav
    : adminNav.filter(([href]) => !["/admin/departments", "/admin/audit-logs"].includes(href));

  return (
    <AppShell
      profile={profile}
      locale={locale}
      signOutLabel={t("signOut", locale)}
      departmentText={departmentText}
      nav={nav.map(([href, label]) => ({ href, label: t(label, locale) }))}
    >
      {children}
    </AppShell>
  );
}
