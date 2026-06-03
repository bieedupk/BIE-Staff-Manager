import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { SignOutButton } from "@/components/layout/sign-out-button";
import type { Locale } from "@/lib/i18n";
import type { Profile } from "@/lib/types";
import { roleLabel } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
};

type Props = {
  children: React.ReactNode;
  profile: Profile;
  nav: NavItem[];
  locale: Locale;
  signOutLabel: string;
  headerWidget?: React.ReactNode;
};

export function AppShell({ children, profile, nav, locale, signOutLabel, headerWidget }: Props) {
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 hidden w-72 border-e border-emerald-100 bg-white p-5 lg:block">
        <Brand />
        <div className="mt-6 rounded-lg bg-emerald-50 p-3">
          <p className="font-bold text-slate-950">{profile.full_name}</p>
          <p className="text-sm font-medium text-slate-600">{roleLabel(profile.role)}</p>
          <p className="text-xs text-slate-500">{profile.department}</p>
        </div>
        <nav className="mt-6 grid gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-emerald-50 hover:text-bie-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 grid gap-3">
          <LanguageToggle locale={locale} />
          <SignOutButton label={signOutLabel} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-emerald-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Brand compact />
          <SignOutButton label={signOutLabel} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-bie-700"
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="mt-3">
          <LanguageToggle locale={locale} />
        </div>
        {headerWidget ? <div className="mt-3">{headerWidget}</div> : null}
      </header>

      <main className="px-4 py-5 lg:ms-72 lg:px-8 lg:py-8">
        {headerWidget ? <div className="mb-5 hidden justify-end lg:flex">{headerWidget}</div> : null}
        {children}
      </main>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-11 place-items-center rounded-lg bg-bie-700 text-white">
        <LayoutDashboard size={22} />
      </div>
      {!compact ? (
        <div>
          <p className="font-extrabold text-slate-950">BIE Staff Manager</p>
          <p className="text-xs font-medium text-slate-500">Board of Islamic Education</p>
        </div>
      ) : (
        <p className="font-extrabold text-slate-950">BIE</p>
      )}
    </div>
  );
}
