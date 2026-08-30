import { AppShell } from "@/components/layout/app-shell";
import { currentDeviceRequestInfo, unauthorizedDeviceMessage, verifyEmployeeDeviceAccess } from "@/lib/authorized-devices";
import { requireEmployeeProfile } from "@/lib/auth";
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
  const [locale, departments, deviceInfo] = await Promise.all([
    getLocale(),
    getEmployeeDepartmentNames(profile.id, profile.department),
    currentDeviceRequestInfo()
  ]);
  const deviceAccess = await verifyEmployeeDeviceAccess(profile, deviceInfo, {
    logMobileBlocked: true
  });

  return (
    <AppShell
      profile={profile}
      locale={locale}
      signOutLabel={t("signOut", locale)}
      departments={departments}
      nav={employeeNav.map(([href, label]) => ({ href, label: t(label, locale) }))}
    >
      {deviceAccess.allowed ? children : <EmployeeAccessBlocked message={deviceAccess.message ?? unauthorizedDeviceMessage} />}
    </AppShell>
  );
}

function EmployeeAccessBlocked({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-red-200 bg-white p-5 shadow-soft">
      <h1 className="text-lg font-extrabold text-slate-950">Access blocked</h1>
      <p className="mt-2 text-sm font-semibold text-red-700">{message}</p>
    </section>
  );
}
