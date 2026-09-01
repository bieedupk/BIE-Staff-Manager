import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireAdminProfile } from "@/lib/auth";
import { getAvatarSignedUrl } from "@/lib/avatar";
import { fetchEmployeeDepartmentText } from "@/lib/employee-departments";
import { getLocale, t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { isAdminManagerRole } from "@/lib/utils";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdminProfile();
  const [locale, supabase, avatarUrl] = await Promise.all([
    getLocale(),
    createClient(),
    getAvatarSignedUrl(profile.avatar_path)
  ]);
  const departmentText = await fetchEmployeeDepartmentText(supabase, profile);
  const isManager = isAdminManagerRole(profile.role);

  const employeeSubNav: NavItem[] = isManager
    ? [
        { href: "/admin/employees/add", label: t("addEmployee", locale) },
        { href: "/admin/employees", label: t("viewEmployees", locale) }
      ]
    : [
        { href: "/admin/employees", label: t("viewEmployees", locale) }
      ];

  const nav: NavItem[] = [
    { href: "/admin/dashboard", label: t("dashboard", locale) },
    {
      href: "/admin/employees",
      label: t("employees", locale),
      children: employeeSubNav
    },
    { href: "/admin/attendance", label: t("attendance", locale) },
    { href: "/admin/tasks", label: t("tasks", locale) },
    { href: "/admin/leaves", label: t("leaves", locale) },
    { href: "/admin/daily-reports", label: t("dailyReports", locale) },
    ...(isManager
      ? [
          { href: "/admin/departments", label: t("departments", locale) },
          { href: "/admin/audit-logs", label: t("auditLogs", locale) }
        ]
      : []),
    { href: "/admin/settings", label: t("settings", locale) },
    { href: "/admin/profile", label: t("myProfile", locale) }
  ];

  return (
    <AppShell
      profile={profile}
      locale={locale}
      signOutLabel={t("signOut", locale)}
      departmentText={departmentText}
      avatarUrl={avatarUrl}
      nav={nav}
    >
      {children}
    </AppShell>
  );
}
