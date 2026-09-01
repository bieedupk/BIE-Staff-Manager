"use client";

import React, { useEffect, useRef } from "react";
import { formatDurationMinutes } from "@/lib/utils";

type DataPoint = {
  label: string; 
  value: number;
  reference?: number;
};

type Props = {
  data: DataPoint[];
  title?: string;
};

export function WorkingHoursChart({ data, title = "Working Hours Trend" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const bars = containerRef.current.querySelectorAll('.working-hours-bar');
    bars.forEach((bar, index) => {
      bar.animate(
        [
          { transform: 'scaleY(0)' },
          { transform: 'scaleY(1)' }
        ],
        {
          duration: 550,
          delay: Math.min(index * 20, 600), // cap max delay
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "none" // Crucial: return to base CSS state after animation
        }
      );
    });
  }, [data]);

  // Check if data is completely empty of work
  if (data.length === 0 || data.every(d => d.value === 0 && (d.reference || 0) === 0)) {
    return (
      <div className="w-full">
        {title && <h3 className="mb-4 text-sm font-bold text-slate-700">{title}</h3>}
        <div className="flex h-40 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
          <p className="text-sm font-medium text-slate-500">No completed working-hours data is available for this period.</p>
        </div>
      </div>
    );
  }

  const maxMins = Math.max(
    ...data.map((d) => Math.max(d.value, d.reference || 0)),
    8 * 60
  );

  return (
    <div className="w-full">
      {title && <h3 className="mb-4 text-sm font-bold text-slate-700">{title}</h3>}
      
      <div 
        ref={containerRef}
        className="relative flex h-48 items-end gap-[2px] sm:gap-1 border-b border-slate-200 pb-2"
      >
        {data.map((d, idx) => {
          const heightPct = Math.min(100, (d.value / maxMins) * 100);
          const refHeightPct = Math.min(100, ((d.reference || 0) / maxMins) * 100);
          
          const showLabel = data.length <= 15 || idx % Math.ceil(data.length / 10) === 0 || idx === data.length - 1;
          
          return (
            <div key={idx} className="group relative flex flex-1 flex-col items-center justify-end h-full">
              {/* Reference line (Scheduled) */}
              {d.reference !== undefined && d.reference > 0 && (
                <div 
                  className="absolute bottom-0 w-full border-t-2 border-dashed border-slate-300 z-0" 
                  style={{ bottom: `${refHeightPct}%` }}
                />
              )}
              
              {/* Actual Bar (Permanent base state) */}
              {d.value > 0 && (
                <div 
                  className="working-hours-bar w-full max-w-12 bg-bie-500 group-hover:bg-bie-600 transition-colors z-10 rounded-t-sm origin-bottom"
                  style={{ height: `${heightPct}%`, transform: "scaleY(1)" }}
                />
              )}
              
              {/* Tooltip (Isolated from bar scale/opacity) */}
              <div 
                className="opacity-0 group-hover:opacity-100 absolute left-1/2 -translate-x-1/2 mb-2 w-max bg-slate-800 text-white text-xs rounded px-2 py-1 pointer-events-none transition-opacity z-20 shadow-lg" 
                style={{ bottom: `${Math.max(heightPct, d.reference ? refHeightPct : 0)}%` }}
              >
                <span className="font-semibold text-slate-300">{d.label}</span><br/>
                Worked: <span className="font-bold">{formatDurationMinutes(d.value)}</span>
                {d.reference !== undefined ? <><br/>Scheduled: <span className="text-slate-300">{formatDurationMinutes(d.reference)}</span></> : null}
              </div>
              
              {/* X-axis label */}
              {showLabel && (
                <span className="absolute -bottom-6 text-[10px] text-slate-500 truncate w-full text-center">
                  {d.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="mt-8 flex justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="block h-3 w-3 rounded-sm bg-bie-500"></span>
          <span>Actual Work</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="block h-0 w-4 border-t-2 border-dashed border-slate-400"></span>
          <span>Scheduled</span>
        </div>
      </div>
    </div>
  );
}
