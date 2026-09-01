"use client";

import React, { useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type RateCardProps = {
  rate: number;
  previousRate: number;
};

export function AttendanceRateCard({ rate, previousRate }: RateCardProps) {
  const circleRef = useRef<SVGCircleElement>(null);
  const delta = rate - previousRate;
  
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    if (circleRef.current) {
      const radius = 60;
      const circumference = 2 * Math.PI * radius;
      const strokeDashoffset = circumference - (rate / 100) * circumference;

      circleRef.current.animate(
        [
          { strokeDashoffset: circumference },
          { strokeDashoffset }
        ],
        {
          duration: 1000,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "none"
        }
      );
    }
  }, [rate]);

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (rate / 100) * circumference;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center py-4">
      <div className="relative mb-6 flex items-center justify-center">
        <svg width="160" height="160" className="-rotate-90 transform">
          {/* Background circle */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="currentColor"
            strokeWidth="12"
            fill="transparent"
            className="text-slate-100"
          />
          {/* Progress circle */}
          <circle
            ref={circleRef}
            cx="80"
            cy="80"
            r={radius}
            stroke="currentColor"
            strokeWidth="12"
            fill="transparent"
            strokeLinecap="round"
            className="text-report-present"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
            }}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold text-slate-900">{Math.round(rate)}%</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rate</span>
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-1 text-sm border-t border-slate-100 pt-4">
        <div className="flex justify-between w-full px-4 text-slate-600">
          <span>Previous:</span>
          <span className="font-semibold">{Math.round(previousRate)}%</span>
        </div>
        <div className="flex justify-between w-full px-4 text-slate-600">
          <span>Change:</span>
          <span className={`flex items-center font-bold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-slate-400"}`}>
            {delta > 0 && <TrendingUp className="mr-1 h-3 w-3" />}
            {delta < 0 && <TrendingDown className="mr-1 h-3 w-3" />}
            {delta === 0 && <Minus className="mr-1 h-3 w-3" />}
            {delta > 0 ? "+" : ""}{Math.round(delta)}%
          </span>
        </div>
      </div>
    </div>
  );
}
