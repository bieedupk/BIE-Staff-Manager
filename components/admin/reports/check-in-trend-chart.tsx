import React from "react";
import { formatTime } from "@/lib/utils";

type DataPoint = {
  label: string; 
  value: number | null; // check-in minutes from midnight
  reference?: number; // scheduled start minutes
  timezone: string;
  rawTime: string | null;
};

type Props = {
  data: DataPoint[];
  title?: string;
};

export function CheckInTrendChart({ data, title = "Check-In Trend" }: Props) {
  if (data.length === 0 || data.every(d => d.value === null)) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
        <p className="text-sm font-medium text-slate-500">No check-in data available</p>
      </div>
    );
  }

  // To scale reasonably, let's find the min and max minutes around the check-in times
  const validVals = data.map(d => d.value).filter((v): v is number => v !== null);
  const refVals = data.map(d => d.reference).filter((v): v is number => v !== undefined);
  
  let minMins = Math.min(...validVals, ...refVals, 8 * 60); // 8:00 AM minimum baseline
  let maxMins = Math.max(...validVals, ...refVals, 10 * 60); // 10:00 AM minimum ceiling

  minMins = Math.max(0, minMins - 60); // 1 hour padding below
  maxMins = maxMins + 60; // 1 hour padding above
  
  const range = maxMins - minMins;

  // ViewBox settings
  const width = 600;
  const height = 200;
  const paddingX = 40;
  const paddingY = 20;
  
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth;

  const getPoint = (val: number, i: number) => {
    const x = paddingX + i * stepX;
    // Invert y: lower minutes (earlier) at top? Or later at top?
    // Usually, time on Y axis has earlier at the top, later at the bottom.
    // Let's put 0 (minMins) at the top (paddingY) and range at bottom.
    const y = paddingY + ((val - minMins) / range) * innerHeight;
    return { x, y };
  };

  // Generate line path connecting valid points
  const pathParts: string[] = [];
  let isFirst = true;
  data.forEach((d, i) => {
    if (d.value !== null) {
      const { x, y } = getPoint(d.value, i);
      if (isFirst) {
        pathParts.push(`M ${x},${y}`);
        isFirst = false;
      } else {
        pathParts.push(`L ${x},${y}`);
      }
    }
  });
  const pathD = pathParts.join(" ");

  // Find reference y if any exists
  const refY = refVals.length > 0 ? getPoint(refVals[0], 0).y : null;

  return (
    <div className="w-full flex flex-col h-full">
      {title && <h3 className="mb-4 text-sm font-bold text-slate-700">{title}</h3>}
      
      <div className="relative w-full flex-1 overflow-visible">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full min-h-[160px] overflow-visible group">
          
          {/* Reference Line */}
          {refY !== null && (
            <line 
              x1={paddingX} y1={refY} x2={width - paddingX} y2={refY} 
              stroke="#10b981" strokeWidth="2" strokeDasharray="6 6" opacity="0.5" 
            />
          )}

          {/* Value Line */}
          {pathD && (
            <path 
              d={pathD} 
              fill="none" 
              stroke="#94a3b8" 
              strokeWidth="2" 
              className="motion-safe:animate-draw-line"
              style={{ strokeDasharray: 2000, strokeDashoffset: 2000 }}
            />
          )}

          {/* Dots */}
          {data.map((d, i) => {
            if (d.value === null) return null;
            const { x, y } = getPoint(d.value, i);
            const isLate = d.reference && d.value > d.reference;
            const color = isLate ? "#fbbf24" : "#10b981"; // amber-400 : emerald-500
            
            return (
              <g key={`dot-${i}`} className="motion-safe:animate-fade-in opacity-0" style={{ animationDelay: `${500 + i * 50}ms` }}>
                <circle 
                  cx={x} cy={y} r="5" 
                  fill={color}
                  stroke="#fff"
                  strokeWidth="2"
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <title>{d.label}: {d.rawTime ? formatTime(d.rawTime, d.timezone) : "-"}</title>
                </circle>
              </g>
            );
          })}

          {/* X Axis Labels */}
          {data.map((d, i) => {
            const showLabel = data.length <= 15 || i % Math.ceil(data.length / 10) === 0 || i === data.length - 1;
            if (!showLabel) return null;
            
            const x = paddingX + i * stepX;
            return (
              <text key={`label-${i}`} x={x} y={height - 2} fontSize="10" fill="#64748b" textAnchor="middle">
                {d.label}
              </text>
            );
          })}
          
          {/* Y Axis Reference Label */}
          {refY !== null && (
            <text x={paddingX - 10} y={refY + 4} fontSize="10" fill="#10b981" textAnchor="end">Start</text>
          )}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="block h-3 w-3 rounded-full bg-emerald-500"></span>
          <span>On Time</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="block h-3 w-3 rounded-full bg-amber-400"></span>
          <span>Late</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="block h-0 w-4 border-t-2 border-dashed border-emerald-500 opacity-50"></span>
          <span>Scheduled Start</span>
        </div>
      </div>
    </div>
  );
}
