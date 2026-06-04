type Props = {
  departments: string[];
  compact?: boolean;
};

export function DepartmentBadges({ departments, compact = false }: Props) {
  const names = departments.map((department) => department.trim()).filter(Boolean);

  if (!names.length) {
    return <span className="text-sm font-semibold text-slate-500">Not assigned</span>;
  }

  return (
    <div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
      {names.map((department) => (
        <span
          key={department}
          className={`max-w-full rounded-lg border border-emerald-200 bg-white font-bold leading-snug text-bie-700 shadow-sm ${
            compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"
          }`}
        >
          {department}
        </span>
      ))}
    </div>
  );
}
