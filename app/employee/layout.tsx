import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { currentDeviceRequestInfo, unauthorizedDeviceMessage, verifyEmployeeDeviceAccess } from "@/lib/authorized-devices";
import { requireEmployeeProfile } from "@/lib/auth";
import { getAvatarSignedUrl } from "@/lib/avatar";
import { getEmployeeDepartmentNames } from "@/lib/employee-departments";
import { getLocale, t } from "@/lib/i18n";

const employeeNav = [
  ["/employee/dashboard", "dashboard"],
  ["/employee/attendance", "attendance"],
  ["/employee/tasks", "tasks"],
  ["/employee/daily-report", "dailyReports"],
  ["/employee/leave", "leaves"],
  ["/employee/profile", "profile"]
] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireEmployeeProfile();
  const [locale, departments, deviceInfo, avatarUrl] = await Promise.all([
    getLocale(),
    getEmployeeDepartmentNames(profile.id, profile.department),
    currentDeviceRequestInfo(),
    getAvatarSignedUrl(profile.avatar_path)
  ]);
  const deviceAccess = await verifyEmployeeDeviceAccess(profile, deviceInfo, {
    logMobileBlocked: true
  });

  if (!deviceAccess.allowed) {
    redirect("/device-access");
  }

  return (
    <AppShell
      profile={profile}
      locale={locale}
      signOutLabel={t("signOut", locale)}
      departments={departments}
      avatarUrl={avatarUrl}
      nav={employeeNav.map(([href, label]) => ({ href, label: t(label, locale) }))}
    >
      {children}
    </AppShell>
  );
}
