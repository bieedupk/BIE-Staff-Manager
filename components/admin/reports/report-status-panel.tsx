"use client";

import React, { useEffect, useState } from "react";

type StatusPanelProps = {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  eligible: number;
  animationKey?: string;
};

export function ReportStatusPanel({ present, late, halfDay, absent, eligible, animationKey }: StatusPanelProps) {
  const presentPct = eligible > 0 ? (present / eligible) * 100 : 0;
  const absentPct = eligible > 0 ? (absent / eligible) * 100 : 0;

  const latePct = present > 0 ? (late / present) * 100 : 0;
  const halfDayPct = present > 0 ? (halfDay / present) * 100 : 0;

  return (
    <div className="flex h-full w-full flex-col p-1 sm:p-2">
      <h3 className="mb-1 text-sm font-bold text-slate-700">Attendance Status Summary</h3>
      <p className="mb-4 text-xs text-slate-500">Late and Half Day are subsets of Present attendance.</p>

      <div className="flex flex-col gap-4 flex-1 justify-center">
        <StatusRow label="Present" value={present} total={eligible} pct={presentPct} colorClass="bg-report-present" animationKey={animationKey} delay={0} />
        <StatusRow label="Absent" value={absent} total={eligible} pct={absentPct} colorClass="bg-report-absent" animationKey={animationKey} delay={120} />

        <div className="my-1 border-t border-dashed border-slate-200"></div>

        <StatusRow label="Late" value={late} total={present} pct={latePct} colorClass="bg-report-late" isSubset animationKey={animationKey} delay={240} />
        <StatusRow label="Half Day" value={halfDay} total={present} pct={halfDayPct} colorClass="bg-report-halfday" isSubset animationKey={animationKey} delay={360} />
      </div>
    </div>
  );
}

function StatusRow({ label, value, total, pct, colorClass, isSubset = false, animationKey, delay }: { label: string, value: number, total: number, pct: number, colorClass: string, isSubset?: boolean, animationKey?: string, delay: number }) {
  const [entered, setEntered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let raf1: number;
    let raf2: number;

    const initTimer = setTimeout(() => {
      const prefers = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setReducedMotion(prefers);

      if (prefers) {
        setEntered(true);
        return;
      }

      setEntered(false);

      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setEntered(true);
        });
      });
    }, 0);

    return () => {
      clearTimeout(initTimer);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [pct, animationKey]);

  const shouldAnimate = entered && !reducedMotion;
  const isInitial = !entered && !reducedMotion;

  return (
    <div
      className="flex flex-col gap-1.5"
      style={{
        opacity: isInitial ? 0 : 1,
        transform: isInitial ? "translateX(-20px)" : "translateX(0)",
        animation: shouldAnimate ? `row-slide-in 600ms ease-out both ${delay}ms` : 'none',
      }}
    >
      <div className="flex justify-between text-xs">
        <span className="font-semibold text-slate-700">
          {isSubset && <span className="mr-1.5 font-normal text-slate-400">↳</span>}
          {label}
        </span>
        <span className="text-slate-500">
          <span className="font-bold text-slate-900">{value}</span> / {total} <span className="ml-1 text-[10px]">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{
            width: `${pct}%`,
            transform: isInitial ? "scaleX(0)" : "scaleX(1)",
            transformOrigin: "left",
            transition: shouldAnimate ? `transform 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms` : "none",
          }}
        />
      </div>
    </div>
  );
}
