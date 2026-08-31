"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { DepartmentBadges } from "@/components/common/department-badges";
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
  departmentText?: string;
  departments?: string[];
  headerWidget?: React.ReactNode;
};

function isItemActive(href: string, currentPath: string | null) {
  if (!currentPath) return false;
  if (currentPath === href) return true;
  if (href !== "/admin" && href !== "/employee" && currentPath.startsWith(href + "/")) {
    return true;
  }
  return false;
}

export function AppShell({
  children,
  profile,
  nav,
  locale,
  signOutLabel,
  departmentText = "Not assigned",
  departments,
  headerWidget
}: Props) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const pathname = usePathname();
  const departmentNames = departments ?? (departmentText === "Not assigned" ? [] : departmentText.split(","));

  // Auto-close drawer on route change
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsDrawerOpen(false);
  }

  // Close drawer on Escape key
  useEffect(() => {
    if (!isDrawerOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen]);

  // Lock background body scroll while mobile drawer is open
  useEffect(() => {
    if (!isDrawerOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isDrawerOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop Sidebar (Permanent on lg screens) */}
      <aside className="fixed inset-y-0 hidden w-72 flex-col justify-between border-e border-emerald-100 bg-white p-5 lg:flex">
        <div className="flex min-h-0 flex-1 flex-col">
          <Brand />
          <div className="mt-6 shrink-0 rounded-lg bg-emerald-50 p-3">
            <p className="font-bold text-slate-950">{profile.full_name}</p>
            <p className="text-sm font-medium text-slate-600">{roleLabel(profile.role)}</p>
            <div className="mt-2">
              <DepartmentBadges departments={departmentNames} compact />
            </div>
          </div>
          <nav className="mt-6 grid min-h-0 flex-1 gap-1 overflow-y-auto pr-1">
            {nav.map((item) => {
              const active = isItemActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "border-s-4 border-bie-700 bg-emerald-100/90 font-extrabold text-bie-800 shadow-xs"
                      : "font-bold text-slate-700 hover:bg-emerald-50 hover:text-bie-700"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-4 grid shrink-0 gap-3 border-t border-emerald-100 pt-4">
          <LanguageToggle locale={locale} />
          <SignOutButton label={signOutLabel} />
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-emerald-100 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={isDrawerOpen}
            aria-controls="mobile-navigation-drawer"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-slate-700 shadow-xs transition hover:bg-emerald-50 hover:text-bie-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700"
          >
            <Menu size={22} />
          </button>
          <Brand compactMobile />
        </div>
        {headerWidget ? <div className="shrink-0">{headerWidget}</div> : null}
      </header>

      {/* Mobile Drawer Backdrop Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs transition-opacity duration-300 lg:hidden ${
          isDrawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile Slide-Out Drawer */}
      <aside
        id="mobile-navigation-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation Menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-xs flex-col justify-between border-e border-emerald-100 bg-white p-5 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          isDrawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Drawer Header with Brand & Close Button */}
          <div className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-4">
            <Brand />
            <button
              type="button"
              onClick={() => setIsDrawerOpen(false)}
              aria-label="Close navigation menu"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-slate-600 shadow-xs transition hover:bg-emerald-50 hover:text-bie-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700"
            >
              <X size={20} />
            </button>
          </div>

          {/* User / Admin Profile Card */}
          <div className="mt-4 shrink-0 rounded-lg border border-emerald-100/80 bg-emerald-50 p-3">
            <p className="text-sm font-bold text-slate-950">{profile.full_name}</p>
            <p className="text-xs font-medium text-slate-600">{roleLabel(profile.role)}</p>
            <div className="mt-2">
              <DepartmentBadges departments={departmentNames} compact />
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="mt-4 grid min-h-0 flex-1 gap-1 overflow-y-auto pr-1">
            {nav.map((item) => {
              const active = isItemActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsDrawerOpen(false)}
                  className={`flex items-center rounded-lg px-3 py-2 text-sm transition ${
                    active
                      ? "border-s-4 border-bie-700 bg-emerald-100/90 font-extrabold text-bie-800 shadow-xs"
                      : "font-bold text-slate-700 hover:bg-emerald-50 hover:text-bie-700"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Drawer Footer Controls */}
        <div className="mt-4 grid shrink-0 gap-3 border-t border-emerald-100 pt-4">
          <LanguageToggle locale={locale} />
          <SignOutButton label={signOutLabel} />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="px-4 py-5 lg:ms-72 lg:px-8 lg:py-8">
        {headerWidget ? <div className="mb-5 hidden justify-end lg:flex">{headerWidget}</div> : null}
        {children}
      </main>
    </div>
  );
}

function Brand({ compactMobile = false }: { compactMobile?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={`grid shrink-0 place-items-center rounded-lg bg-bie-700 text-white shadow-xs ${
          compactMobile ? "size-9" : "size-11"
        }`}
      >
        <LayoutDashboard size={compactMobile ? 18 : 22} />
      </div>
      <div className="min-w-0 truncate">
        <p
          className={`truncate font-extrabold text-slate-950 ${
            compactMobile ? "text-sm leading-tight" : "text-base leading-snug"
          }`}
        >
          BIE Staff Manager
        </p>
        <p
          className={`truncate font-semibold text-slate-500 ${
            compactMobile ? "text-[10px] leading-tight" : "text-xs font-medium"
          }`}
        >
          Board of Islamic Education
        </p>
      </div>
    </div>
  );
}
