import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  icon?: LucideIcon;
};

export function StatCard({ label, value, hint, href, icon: Icon }: Props) {
  const card = (
    <article className="relative h-full overflow-hidden rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
      {Icon ? (
        <Icon
          className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-200"
          size={64}
          strokeWidth={1.25}
          aria-hidden="true"
        />
      ) : null}
      <div className="relative">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-extrabold text-slate-950">{value}</p>
        {hint ? <p className="mt-2 text-xs font-medium text-slate-500">{hint}</p> : null}
      </div>
    </article>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="block rounded-lg transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  );
}
