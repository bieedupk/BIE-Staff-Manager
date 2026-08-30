export default function AdminLoading() {
  return (
    <>
      {/* Page header skeleton */}
      <section className="mb-5">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-emerald-100" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded-lg bg-emerald-50" />
      </section>

      {/* Content skeleton */}
      <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
        <div className="h-5 w-36 animate-pulse rounded-lg bg-emerald-100" />
        <div className="mt-4 grid gap-3">
          <div className="h-4 w-full animate-pulse rounded-lg bg-slate-100" />
          <div className="h-4 w-5/6 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-4 w-4/6 animate-pulse rounded-lg bg-slate-50" />
        </div>
      </section>

      {/* Card grid skeleton */}
      <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft"
          >
            <div className="h-4 w-24 animate-pulse rounded-lg bg-emerald-100" />
            <div className="mt-3 h-3 w-full animate-pulse rounded-lg bg-slate-100" />
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded-lg bg-slate-50" />
          </div>
        ))}
      </section>
    </>
  );
}
