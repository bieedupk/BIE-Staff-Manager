"use client";

import React, { useState, useEffect } from "react";

type PunctualityData = {
  label: string;
  actualMinutes: number | null;
  scheduledMinutes: number;
  actualTimeStr: string | null;
  scheduledTimeStr: string;
  isLate: boolean;
  isAbsent: boolean;
  isPending: boolean;
  isPresent: boolean;
  dateStr: string;
};

export function PunctualityLineChart({ data, title, animationKey }: { data: PunctualityData[]; title: string; animationKey?: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
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

  // Determine Y-axis window
  const validActuals = data.filter(d => d.actualMinutes !== null).map(d => d.actualMinutes as number);
  const scheds = data.map(d => d.scheduledMinutes);

  const minMinutes = Math.min(...validActuals, ...scheds, 1440);
  const maxMinutes = Math.max(...validActuals, ...scheds, 0);

  const paddedMin = Math.min(minMinutes - 15, 8 * 60 - 30); // At least 7:30 AM
  const paddedMax = Math.max(maxMinutes + 15, 10 * 60); // At least 10:00 AM
  const range = paddedMax - paddedMin || 1;

  const width = 1000;
  const height = 200;
  const colWidth = width / Math.max(1, data.length);

  // x positions correspond to the center of each column (matching a CSS grid)
  const getX = (index: number) => (index + 0.5) * colWidth;

  const segments: { x: number, y: number, isLate: boolean }[][] = [];
  let currentSegment: { x: number, y: number, isLate: boolean }[] = [];

  data.forEach((d, i) => {
    if (d.actualMinutes !== null) {
      const x = getX(i);
      const y = height - ((d.actualMinutes - paddedMin) / range) * height;
      currentSegment.push({ x, y, isLate: d.isLate });
    } else {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
  });
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  const yTicks = [];
  for (let m = Math.ceil(paddedMin / 30) * 30; m <= paddedMax; m += 30) {
    yTicks.push(m);
  }

  return (
    <div className="flex w-full flex-col p-1 sm:p-2">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-base font-extrabold text-slate-800">{title}</h3>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-report-present"></div>
            <span>On-time</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-report-late"></div>
            <span>Late</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-report-absent"></div>
            <span>Absent</span>
          </div>
          <div className="flex items-center gap-1.5 ml-1">
            <div className="h-0.5 w-3 bg-report-scheduled border-t border-dashed border-report-scheduled"></div>
            <span>Scheduled</span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 flex w-full mx-auto max-w-4xl" dir="ltr" onMouseLeave={() => setHoveredIndex(null)}>
        {/* Y Axis Labels */}
        <div className="w-10 shrink-0 flex flex-col relative border-r border-slate-100 py-0 text-[10px] font-medium text-slate-400">
          {yTicks.map(m => {
            const yPct = ((m - paddedMin) / range) * 100;
            const hours = Math.floor(m / 60);
            const mins = m % 60;
            const h = hours % 12 || 12;
            const label = `${h}:${mins.toString().padStart(2, '0')}`;
            return (
              <span key={m} className="absolute right-2 translate-y-1/2 bg-white px-0.5" style={{ bottom: `${yPct}%` }}>
                {label}
              </span>
            );
          })}
        </div>

        <div className="flex-1 relative px-2 sm:px-4" style={{ minHeight: "220px", maxHeight: "280px" }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full w-full overflow-visible motion-safe:animate-fade-in"
            preserveAspectRatio="none"
            style={entered ? { animation: "chart-settle 400ms ease-out forwards 1600ms" } : undefined}
          >

            {/* Horizontal Grid Lines */}
            {yTicks.map(m => {
              const y = height - ((m - paddedMin) / range) * height;
              return (
                <line
                  key={`grid-${m}`}
                  x1="0" y1={y} x2={width} y2={y}
                  stroke="#f1f5f9" // slate-100
                  strokeWidth="1"
                />
              );
            })}

            {/* Scheduled Line (full width) */}
            <line
              x1="0"
              y1={height - ((Math.max(...scheds) - paddedMin) / range) * height}
              x2={width}
              y2={height - ((Math.max(...scheds) - paddedMin) / range) * height}
              stroke="currentColor"
              className="text-report-scheduled"
              strokeWidth="2"
              strokeDasharray="6 4"
              opacity="0.5"
            />

            {/* Actual Lines (broken segments) */}
            {segments.map((segment, sIdx) => (
              <path
                key={`seg-${sIdx}`}
                d={segment.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(" ")}
                fill="none"
                stroke="currentColor"
                className="text-report-text opacity-40"
                strokeWidth="2"
                pathLength="1"
                style={{
                  strokeDasharray: "1",
                  strokeDashoffset: entered ? "0" : "1",
                  transition: "stroke-dashoffset 1600ms linear",
                }}
              />
            ))}

            {/* Status Markers and Points */}
            {data.map((d, i) => {
              const x = getX(i);
              const pointDelay = i * 150;

              if (d.actualMinutes !== null) {
                const y = height - ((d.actualMinutes - paddedMin) / range) * height;
                return (
                  <circle
                    key={`actual-${i}`}
                    cx={x}
                    cy={y}
                    r="6"
                    fill="currentColor"
                    className={d.isLate ? "text-report-late" : "text-report-present"}
                    stroke="#fff"
                    strokeWidth="2"
                    style={{
                      opacity: entered ? 1 : 0,
                      transform: entered ? "translateY(0)" : "translateY(4px)",
                      transition: "opacity 400ms ease-out, transform 400ms ease-out",
                      transitionDelay: `${pointDelay}ms`
                    }}
                  />
                );
              } else {
                // Render status indicator near the bottom for Absent / Pending days
                const markerY = height - 10;

                if (d.isAbsent) {
                  return <circle key={`absent-${i}`} cx={x} cy={markerY} r="4" fill="currentColor" className="text-report-absent" style={{ opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(4px)", transition: "opacity 400ms ease-out, transform 400ms ease-out", transitionDelay: `${pointDelay}ms` }} />;
                }

                if (d.isPending) {
                  return <circle key={`pending-${i}`} cx={x} cy={markerY} r="4" fill="currentColor" className="text-report-pending" style={{ opacity: entered ? 0.5 : 0, transform: entered ? "translateY(0)" : "translateY(4px)", transition: "opacity 400ms ease-out, transform 400ms ease-out", transitionDelay: `${pointDelay}ms` }} />;
                }

                return null;
              }
            })}

            {/* Hover zones for tooltips */}
            {data.map((d, i) => (
              <rect
                key={`zone-${i}`}
                x={i * colWidth}
                y="0"
                width={colWidth}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                className="cursor-pointer outline-none"
              />
            ))}
          </svg>

          {/* Absolute Tooltip Overlay */}
          {hoveredIndex !== null && (
            <div
              className="pointer-events-none absolute z-50 mb-4 w-max -translate-x-1/2 rounded-lg bg-slate-900/95 px-3 py-2.5 text-xs text-white shadow-xl backdrop-blur-sm"
              style={{
                left: `${((hoveredIndex + 0.5) / data.length) * 100}%`,
                bottom: data[hoveredIndex].actualMinutes !== null
                  ? `${((data[hoveredIndex].actualMinutes! - paddedMin) / range) * 100}%`
                  : '0%' // Near bottom for absent
              }}
            >
              <div className="mb-2 border-b border-slate-700/50 pb-1.5 font-bold text-slate-100">{data[hoveredIndex].dateStr}</div>

              <div className="mb-2 flex items-start gap-1">
                <span className="text-slate-400">Status: </span>
                <span className="font-semibold text-white">
                  {data[hoveredIndex].isAbsent ? <span className="text-red-400">Absent</span> :
                   data[hoveredIndex].isPending ? <span className="text-slate-400">Pending</span> :
                   data[hoveredIndex].isLate ? <span className="text-amber-400">Late</span> :
                   <span className="text-emerald-400">On-time</span>}
                </span>
              </div>

              {data[hoveredIndex].actualMinutes !== null ? (
                <>
                  <div className="flex justify-between gap-3 text-slate-300">
                    <span>Check-in:</span>
                    <span className="font-semibold text-white">{data[hoveredIndex].actualTimeStr}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-slate-400">
                    <span>Scheduled:</span>
                    <span>{data[hoveredIndex].scheduledTimeStr}</span>
                  </div>
                </>
              ) : (
                <div className="text-slate-400">No check-in</div>
              )}

              <div className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-slate-900/95"></div>
            </div>
          )}
        </div>
      </div>

      <div
        className="relative mx-auto w-full max-w-4xl"
        dir="ltr"
      >
        <div
          className="ml-10 mt-3 grid gap-2 sm:gap-3 lg:gap-5 px-2 sm:px-4"
          style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
        >
          {data.map((d, i) => (
            <div
              key={`lbl-${i}`}
              className="text-center text-[11px] sm:text-xs font-semibold text-slate-500 truncate"
            >
              {(data.length > 10 && i % Math.ceil(data.length / 8) !== 0) ? "" : d.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
