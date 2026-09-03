import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: number | string;
  href?: string;
  icon?: LucideIcon;
  accent?: "emerald" | "red" | "amber" | "orange" | "blue" | "slate" | "teal";
  animationDelay?: number;
};

export function StatCard({ label, value, href, icon: Icon, accent = "slate", animationDelay = 0 }: Props) {
  const iconColors = {
    emerald: "text-emerald-600 bg-emerald-100",
    red: "text-red-600 bg-red-100",
    amber: "text-amber-600 bg-amber-100",
    orange: "text-orange-600 bg-orange-100",
    blue: "text-blue-600 bg-blue-100",
    slate: "text-slate-600 bg-slate-100",
    teal: "text-teal-600 bg-teal-100",
  };

  const card = (
    <article
      className="flex h-full min-h-[116px] w-full flex-col rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-shadow motion-safe:animate-fade-up opacity-0"
      style={{ animationDelay: `${animationDelay}ms`, animationFillMode: 'forwards' }}
    >
      <p className="w-full text-left text-xs font-bold text-slate-500 uppercase tracking-wider leading-snug">
        {label}
      </p>
      <div className="mt-1 flex flex-1 w-full items-center justify-start gap-4">
        {Icon ? (
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${iconColors[accent]}`}>
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
        ) : null}
        <p className="text-2xl sm:text-[28px] font-extrabold text-slate-900 leading-none">
          {value}
        </p>
      </div>
    </article>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="block h-full rounded-xl transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  );
}
