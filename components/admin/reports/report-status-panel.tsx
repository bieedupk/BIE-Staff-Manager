"use client";

import React, { useEffect, useRef } from "react";

type StatusPanelProps = {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  eligible: number;
};

export function ReportStatusPanel({ present, late, halfDay, absent, eligible }: StatusPanelProps) {
  const presentPct = eligible > 0 ? (present / eligible) * 100 : 0;
  const absentPct = eligible > 0 ? (absent / eligible) * 100 : 0;
  
  const latePct = present > 0 ? (late / present) * 100 : 0;
  const halfDayPct = present > 0 ? (halfDay / present) * 100 : 0;

  return (
    <div className="flex h-full w-full flex-col">
      <h3 className="mb-1 text-sm font-bold text-slate-700">Attendance Status Summary</h3>
      <p className="mb-4 text-xs text-slate-500">Late and Half Day are subsets of Present attendance.</p>
      
      <div className="flex flex-col gap-4 flex-1 justify-center">
        <StatusRow label="Present" value={present} total={eligible} pct={presentPct} colorClass="bg-report-present" />
        <StatusRow label="Absent" value={absent} total={eligible} pct={absentPct} colorClass="bg-report-absent" />
        
        <div className="my-1 border-t border-dashed border-slate-200"></div>
        
        <StatusRow label="Late" value={late} total={present} pct={latePct} colorClass="bg-report-late" isSubset />
        <StatusRow label="Half Day" value={halfDay} total={present} pct={halfDayPct} colorClass="bg-report-halfday" isSubset />
      </div>
    </div>
  );
}

function StatusRow({ label, value, total, pct, colorClass, isSubset = false }: { label: string, value: number, total: number, pct: number, colorClass: string, isSubset?: boolean }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    if (barRef.current) {
      barRef.current.animate(
        [
          { transform: "scaleX(0)" },
          { transform: "scaleX(1)" }
        ],
        {
          duration: 800,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "none"
        }
      );
    }
  }, [pct]);

  return (
    <div className={`flex flex-col gap-1.5 ${isSubset ? 'pl-4 border-l-2 border-slate-100' : ''}`}>
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="text-slate-500">
          <span className="font-bold text-slate-900">{value}</span> / {total} <span className="ml-1 text-[10px]">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div 
          ref={barRef}
          className={`h-full rounded-full ${colorClass}`}
          style={{ 
            width: `${pct}%`,
            transform: "scaleX(1)",
            transformOrigin: "left"
          }}
        />
      </div>
    </div>
  );
}
