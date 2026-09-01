import Link from "next/link";

type ProfileTab = {
  id: string;
  label: string;
  href: string;
  isAvailable: boolean;
};

type ProfileTabsProps = {
  employeeId: string;
  activeTab?: string;
};

export function ProfileTabs({ employeeId, activeTab = "overview" }: ProfileTabsProps) {
  // Phase 1 provides Overview. Future modules will enable Attendance, Reports, Corrections.
  const tabs: ProfileTab[] = [
    {
      id: "overview",
      label: "Overview",
      href: `/admin/employees/${employeeId}`,
      isAvailable: true
    }
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b border-emerald-100 pb-px" aria-label="Profile Sections">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-extrabold transition ${
              isActive
                ? "border-bie-700 bg-white text-bie-700 shadow-2xs"
                : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
