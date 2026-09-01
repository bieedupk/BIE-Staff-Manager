import React from "react";

type Props = {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  eligible: number;
};

export function AttendanceStatusSummary({ present, late, halfDay, absent, eligible }: Props) {
  if (eligible === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
        <p className="text-sm font-medium text-slate-500">No data</p>
      </div>
    );
  }

  const presentPct = Math.round((present / eligible) * 100) || 0;
  const absentPct = Math.round((absent / eligible) * 100) || 0;
  
  // Late and Half Day are subsets of Present, so use present as denominator
  const latePct = present > 0 ? Math.round((late / present) * 100) : 0;
  const halfDayPct = present > 0 ? Math.round((halfDay / present) * 100) : 0;

  return (
    <div className="w-full">
      <h3 className="text-sm font-bold text-slate-700">Attendance Status Summary</h3>
      <p className="mb-4 text-xs font-medium text-slate-500">Late and Half Day are subsets of Present attendance.</p>
      
      <div className="flex flex-col gap-4">
        {/* Present Row */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-emerald-800">Present</span>
            <span className="text-xs font-extrabold text-emerald-900">{present}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-2 w-full overflow-hidden rounded bg-emerald-100 flex-1">
              <div 
                className="h-full bg-emerald-500 origin-left motion-safe:animate-scale-up-x rounded" 
                style={{ width: `${presentPct}%`, animationFillMode: "both" }} 
              />
            </div>
            <span className="text-[10px] font-semibold text-slate-500 w-24 text-right">{presentPct}% of eligible days</span>
          </div>
        </div>

        {/* Absent Row */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-red-800">Absent</span>
            <span className="text-xs font-extrabold text-red-900">{absent}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-2 w-full overflow-hidden rounded bg-red-100 flex-1">
              <div 
                className="h-full bg-red-400 origin-left motion-safe:animate-scale-up-x rounded" 
                style={{ width: `${absentPct}%`, animationFillMode: "both", animationDelay: "50ms" }} 
              />
            </div>
            <span className="text-[10px] font-semibold text-slate-500 w-24 text-right">{absentPct}% of eligible days</span>
          </div>
        </div>

        {/* Late Row */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-amber-800">Late Arrivals</span>
            <span className="text-xs font-extrabold text-amber-900">{late}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-2 w-full overflow-hidden rounded bg-amber-100 flex-1">
              <div 
                className="h-full bg-amber-400 origin-left motion-safe:animate-scale-up-x rounded" 
                style={{ width: `${latePct}%`, animationFillMode: "both", animationDelay: "100ms" }} 
              />
            </div>
            <span className="text-[10px] font-semibold text-slate-500 w-24 text-right">{latePct}% of present days</span>
          </div>
        </div>

        {/* Half Day Row */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-orange-800">Half Days</span>
            <span className="text-xs font-extrabold text-orange-900">{halfDay}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative h-2 w-full overflow-hidden rounded bg-orange-100 flex-1">
              <div 
                className="h-full bg-orange-400 origin-left motion-safe:animate-scale-up-x rounded" 
                style={{ width: `${halfDayPct}%`, animationFillMode: "both", animationDelay: "150ms" }} 
              />
            </div>
            <span className="text-[10px] font-semibold text-slate-500 w-24 text-right">{halfDayPct}% of present days</span>
          </div>
        </div>
      </div>
    </div>
  );
}
