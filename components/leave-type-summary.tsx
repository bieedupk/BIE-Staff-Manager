import type { LeaveTypeCount } from "@/lib/leave-year-summary";

const standardTypes = ["Rotation Off", "Sick", "Casual", "Annual", "Emergency", "Other"];

export function LeaveTypeSummary({ year, counts }: { year: number; counts: LeaveTypeCount[] }) {
  const byType = new Map(counts.map((item) => [item.type, item]));
  const types = [...standardTypes, ...counts.map((item) => item.type).filter((type) => !standardTypes.includes(type))];

  return (
    <div>
      <p className="text-xs font-bold text-slate-600">Approved leave used in {year} through today (calendar days, by type)</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {types.map((type) => {
          const item = byType.get(type);
          return (
            <span key={type} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700">
              <strong>{type}:</strong> {item?.days ?? 0} day(s) · {item?.requests ?? 0} request(s)
            </span>
          );
        })}
      </div>
    </div>
  );
}
