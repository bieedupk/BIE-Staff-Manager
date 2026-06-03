import Link from "next/link";

type Props = {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
};

export function StatCard({ label, value, hint, href }: Props) {
  const card = (
    <article className="h-full rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-extrabold text-slate-950">{value}</p>
      {hint ? <p className="mt-2 text-xs font-medium text-slate-500">{hint}</p> : null}
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
