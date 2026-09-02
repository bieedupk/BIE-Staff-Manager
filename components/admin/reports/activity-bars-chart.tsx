"use client";

import React, { useEffect, useState } from "react";
import { formatDurationMinutes } from "@/lib/utils";

type ActivityData = {
  label: string;
  worked: number;
  scheduled: number;
  overtime: number;
  dateStr: string;
  isAbsent: boolean;
  isPresent?: boolean;
  isLate?: boolean;
  isHalfDay?: boolean;
  isPending?: boolean;
};

export function ActivityBarsChart({ data, title, animationKey }: { data: ActivityData[]; title: string; animationKey?: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [entered, setEntered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let raf1: number;
    let raf2: number;

    // Safely reset entered to allow initial paint before animating
    // By using a small timeout, we avoid synchronous setState in effect body
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
  }, [animationKey]);
  const highestDataMins = Math.max(...data.map(d => Math.max(d.worked, d.scheduled)));
  const baseMax = Math.max(8 * 60, highestDataMins);

  // Modest headroom: add 60 minutes and round up to the nearest 120 (2 hours)
  const maxVal = Math.ceil((baseMax + 60) / 120) * 120;

  // Use the max scheduled duration as the chart-wide reference line
  const maxScheduled = Math.max(...data.map(d => d.scheduled));
  const globalSchedPct = Math.max(1, Math.min(100, (maxScheduled / maxVal) * 100));

  // Determine Y-axis ticks
  const stepMinutes = maxVal > 12 * 60 ? 4 * 60 : 2 * 60;
  const yTicks = [];
  for (let m = 0; m <= maxVal; m += stepMinutes) {
    yTicks.push(m);
  }

  // Bar width constraint based on type (inferred from data length)
  const isMonthly = data.length > 25;
  const barMaxWidth = isMonthly ? "max-w-[20px]" : "max-w-[48px]";
  const barBaseWidth = isMonthly ? "w-[40%]" : "w-[50%]";

  let currentPopulated = 0;
  const populatedIndices = data.map(d => {
    if (d.worked > 0) {
      const idx = currentPopulated;
      currentPopulated++;
      return idx;
    }
    return -1;
  });

  const delayInterval = data.length > 25 ? 28 : data.length > 10 ? 70 : 100;

  return (
    <div className="flex h-full w-full flex-col p-1 sm:p-2">
      {/* Header Row: Title & Legend */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-base font-extrabold text-slate-800">{title}</h3>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-[3px] bg-report-present"></div>
            <span>Present</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-[3px] bg-report-halfday"></div>
            <span>Half Day</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 bg-report-present relative overflow-hidden rounded-[3px]">
              <div className="absolute top-0 left-0 right-0 h-1 bg-report-late"></div>
            </div>
            <span>Late</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-3 rounded-full bg-report-absent"></div>
            <span>Absent</span>
          </div>
          <div className="flex items-center gap-1.5 ml-1">
            <div className="h-0.5 w-3 bg-report-scheduled border-t border-dashed border-report-scheduled"></div>
            <span>Scheduled</span>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 w-full mx-auto max-w-4xl" dir="ltr" onMouseLeave={() => setHoveredIndex(null)}>

        {/* Y-Axis scale */}
        <div className="w-10 shrink-0 relative border-r border-slate-100 flex flex-col justify-between py-0 text-[10px] font-medium text-slate-400">
          {yTicks.map(m => {
            const yPct = (m / maxVal) * 100;
            return (
              <span key={m} className="absolute right-2 translate-y-1/2 bg-white px-0.5" style={{ bottom: `${yPct}%` }}>
                {m === 0 ? "0h" : `${Math.floor(m / 60)}h`}
              </span>
            );
          })}
        </div>

        {/* Plotting Area */}
        <div className="relative flex-1 px-2 sm:px-4" style={{ minHeight: "220px", maxHeight: "280px" }}>

          {/* Horizontal Grid Lines matching Y-ticks */}
          {yTicks.map(m => {
            const yPct = (m / maxVal) * 100;
            if (m === 0) return null; // hide bottom line
            return (
              <div
                key={`grid-${m}`}
                className="absolute left-0 right-0 z-0 h-px bg-slate-100/60"
                style={{ bottom: `${yPct}%` }}
              />
            );
          })}

          {/* Global Scheduled Reference Line */}
          {maxScheduled > 0 && (
            <div
              className="absolute left-0 right-0 z-0 h-px border-t-2 border-dashed border-report-scheduled/60"
              style={{ bottom: `${globalSchedPct}%` }}
            >
              <span className="absolute right-0 bottom-1 text-[9px] font-semibold text-slate-400 bg-white/80 px-1 rounded">
                Scheduled{maxScheduled > 0 ? `: ${formatDurationMinutes(maxScheduled)}` : ''}
              </span>
            </div>
          )}

          {/* Column Grid */}
          <div
            className="relative grid h-full gap-1 sm:gap-2 lg:gap-4"
            style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
          >
            {data.map((d, i) => {
              const heightPct = Math.max(0, Math.min(100, (d.worked / maxVal) * 100));

              let barColor = "bg-report-present"; // default present
              let hasBar = d.worked > 0;

              // Half Day uses orange bar
              if (d.isHalfDay) {
                barColor = "bg-report-halfday";
              } else if (d.isAbsent || d.isPending) {
                hasBar = false; // "Absent day: no worked-hours bar"
              } else if (d.isLate && !d.isHalfDay) {
                barColor = "bg-report-present"; // green bar + amber cap overlay
              }

              const staggerDelay = populatedIndices[i] >= 0 ? populatedIndices[i] * delayInterval : i * (delayInterval / 2);
              const markerDelay = staggerDelay;

              const shouldAnimate = entered && !reducedMotion;
              const isInitial = !entered && !reducedMotion;

              // We compute bar inline styles dynamically
              // If reduced motion, always render the final state.
              const barTransform = isInitial ? "translateY(14px) scaleY(0)" : "translateY(0) scaleY(1)";
              const barOpacity = isInitial ? 0 : (hoveredIndex !== null && hoveredIndex !== i ? 0.4 : 1);

              return (
                <div
                  key={i}
                  className="group relative flex h-full flex-col justify-end items-center"
                  onMouseEnter={() => setHoveredIndex(i)}
                >
                  {/* Working Bar Container */}
                  <div className="w-full flex-1 flex flex-col justify-end items-center relative z-10">

                    {hasBar ? (
                      <div
                        className={`activity-bar-anim relative ${barBaseWidth} ${barMaxWidth} rounded-t-md ${barColor} shadow-sm overflow-hidden flex flex-col justify-start`}
                        style={{
                          height: `${heightPct}%`,
                          transformOrigin: "bottom center",
                          transform: barTransform,
                          opacity: barOpacity,
                          animation: shouldAnimate ? `bar-grow-settle 1800ms cubic-bezier(0.22, 1, 0.36, 1) both ${staggerDelay}ms` : 'none',
                          filter: hoveredIndex !== null && hoveredIndex !== i ? 'grayscale(30%)' : 'none',
                          transition: "opacity 200ms ease-out, filter 200ms ease-out"
                        }}
                      >
                        {/* Late Top Cap Indicator integrated as an OVERLAY to preserve bar geometry */}
                        {d.isLate && (
                          <div className="absolute top-0 left-0 right-0 h-1.5 sm:h-2 bg-report-late opacity-100 shadow-sm" title="Late"></div>
                        )}
                      </div>
                    ) : (
                      /* Baseline Status Stripes for Absent / Pending */
                      <div className="absolute bottom-0 flex h-[24px] w-full items-end justify-center pb-1">
                        {d.isAbsent && (
                          <div
                            className={`h-1.5 w-full ${barMaxWidth} rounded-full bg-report-absent`}
                            title="Absent"
                            style={{
                              opacity: isInitial ? 0 : 1,
                              transition: "opacity 400ms ease-out",
                              transitionDelay: `${markerDelay}ms`
                            }}
                          />
                        )}
                        {d.isPending && (
                          <div
                            className={`h-1.5 w-full ${barMaxWidth} rounded-full bg-slate-200`}
                            title="Pending"
                            style={{
                              opacity: isInitial ? 0 : 0.8,
                              transition: "opacity 400ms ease-out",
                              transitionDelay: `${markerDelay}ms`
                            }}
                          />
                        )}
                      </div>
                    )}

                    {/* Baseline subtle track for aesthetic grounding */}
                    <div className={`absolute bottom-0 h-1 w-full ${barMaxWidth} rounded-full bg-slate-100 -z-10`}></div>
                  </div>

                  {/* Date Label directly beneath */}
                  <div className="mt-3 text-center text-[10px] sm:text-[11px] font-semibold text-slate-500 truncate w-full">
                    {d.label}
                  </div>

                  {/* Hover Tooltip Overlay */}
                  {hoveredIndex === i && (
                    <div className="pointer-events-none absolute bottom-[calc(100%+12px)] left-1/2 z-50 mb-1 w-max -translate-x-1/2 rounded-lg bg-slate-900/95 px-3 py-2.5 text-xs text-white shadow-xl backdrop-blur-sm">
                      <div className="mb-2 border-b border-slate-700/50 pb-1.5 font-bold text-slate-100">{d.dateStr}</div>

                      <div className="mb-2 flex items-start gap-2">
                        <span className="text-slate-400">Status:</span>
                        <div className="flex flex-col font-semibold leading-tight gap-1">
                          {d.isAbsent && <span className="text-red-400">Absent</span>}
                          {d.isPending && <span className="text-slate-400">Pending</span>}

                          {d.isPresent && !d.isAbsent && (
                            <span className="text-emerald-400">Present</span>
                          )}
                          {d.isLate && <span className="text-amber-400">Late</span>}
                          {d.isHalfDay && <span className="text-orange-400">Half Day</span>}
                        </div>
                      </div>

                      {hasBar ? (
                        <div className="grid gap-1.5 mt-2">
                          <div className="flex justify-between gap-4 text-slate-300">
                            <span>Worked:</span>
                            <span className="font-semibold text-white">{formatDurationMinutes(d.worked)}</span>
                          </div>
                          {d.scheduled > 0 && (
                            <div className="flex justify-between gap-4 text-slate-400">
                              <span>Scheduled:</span>
                              <span>{formatDurationMinutes(d.scheduled)}</span>
                            </div>
                          )}
                          {d.overtime > 0 && (
                            <div className="flex justify-between gap-4 text-bie-300 mt-1 pt-1 border-t border-slate-700/50">
                              <span>Overtime:</span>
                              <span className="font-semibold">{formatDurationMinutes(d.overtime)}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        d.isAbsent && (
                          <div className="flex justify-between gap-4 text-slate-400 mt-2">
                            <span>Worked:</span>
                            <span>0 minutes</span>
                          </div>
                        )
                      )}

                      {/* Tooltip arrow */}
                      <div className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-slate-900/95"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
