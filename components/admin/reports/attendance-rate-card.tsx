"use client";

import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { MetricComparison } from "@/lib/attendance-report";

type RateCardProps = {
  rate: number;
  comparison?: MetricComparison;
  label?: string;
  animationKey?: string;
};

export function AttendanceRateCard({ rate, comparison, label = "Attendance Rate", animationKey }: RateCardProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let raf1: number;
    let raf2: number;

    raf1 = requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReducedMotion) {
        setEntered(true);
        return;
      }

      raf2 = requestAnimationFrame(() => {
        setEntered(true);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [animationKey]);

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (rate / 100) * circumference;

  const [displayRate, setDisplayRate] = useState(0);

  useEffect(() => {
    if (!entered) return;

    let startTimestamp: number | null = null;
    const duration = 1400;

    let rafId: number;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);

      // Use an ease-out easing function
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayRate(Math.floor(easeOut * rate));

      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setDisplayRate(Math.round(rate));
      }
    };

    rafId = window.requestAnimationFrame(step);

    return () => window.cancelAnimationFrame(rafId);
  }, [entered, rate]);

  return (
    <div className="flex h-full w-full flex-col p-1 sm:p-2">
      <h3 className="mb-6 text-base font-extrabold text-slate-800 px-1">{label}</h3>
      <div className="relative mb-4 flex flex-1 items-center justify-center">
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
              strokeDashoffset: entered ? strokeDashoffset : circumference,
              transition: "stroke-dashoffset 1700ms ease-out",
            }}
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold text-slate-900">{displayRate}%</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Rate</span>
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-1 text-sm border-t border-slate-100 pt-4">
        {comparison && (
          <>
            <div className="flex justify-between w-full px-4 text-slate-600">
              <span>Previous:</span>
              <span className="font-semibold">{Math.round(comparison.previous)}%</span>
            </div>
            <div className="flex justify-between w-full px-4 text-slate-600">
              <span>Change:</span>
              <span className={`flex items-center font-bold ${comparison.delta > 0 ? "text-emerald-600" : comparison.delta < 0 ? "text-red-600" : "text-slate-400"}`}>
                {comparison.delta > 0 && <TrendingUp className="mr-1 h-3 w-3" />}
                {comparison.delta < 0 && <TrendingDown className="mr-1 h-3 w-3" />}
                {comparison.delta === 0 && <Minus className="mr-1 h-3 w-3" />}
                {comparison.delta > 0 ? "+" : ""}{Math.round(comparison.delta)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
