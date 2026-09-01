import React from "react";

type DataPoint = {
  label: string; 
  value: number; // percentage 0-100
};

type Props = {
  data: DataPoint[];
  title?: string;
  previousData?: DataPoint[]; // Optional previous series
};

export function AttendanceTrendChart({ data, previousData, title = "Attendance Trend" }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
        <p className="text-sm font-medium text-slate-500">No data available</p>
      </div>
    );
  }

  // ViewBox settings
  const width = 800;
  const height = 240;
  const paddingX = 40;
  const paddingY = 30;
  
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : innerWidth;
  
  // Helper to generate path d attribute
  const generatePath = (points: DataPoint[]) => {
    if (points.length === 0) return "";
    return points.reduce((acc, point, i) => {
      const x = paddingX + i * stepX;
      // y is inverted because SVG origin is top-left
      const y = paddingY + innerHeight - (Math.max(0, Math.min(100, point.value)) / 100) * innerHeight;
      
      if (i === 0) return `M ${x},${y}`;
      
      // Smooth curve using bezier
      const prevX = paddingX + (i - 1) * stepX;
      const prevY = paddingY + innerHeight - (Math.max(0, Math.min(100, points[i-1].value)) / 100) * innerHeight;
      const cpX = (prevX + x) / 2;
      return `${acc} C ${cpX},${prevY} ${cpX},${y} ${x},${y}`;
    }, "");
  };

  const pathD = generatePath(data);
  const prevPathD = previousData ? generatePath(previousData) : "";
  
  // Area path requires closing to the bottom
  const areaD = data.length > 0 
    ? `${pathD} L ${paddingX + (data.length - 1) * stepX},${paddingY + innerHeight} L ${paddingX},${paddingY + innerHeight} Z`
    : "";

  return (
    <div className="w-full flex flex-col h-full">
      <div className="mb-4 flex items-center justify-between">
        {title && <h3 className="text-sm font-bold text-slate-700">{title}</h3>}
        {previousData && previousData.length > 0 && (
          <div className="flex gap-4 text-xs font-medium">
            <div className="flex items-center gap-1 text-bie-700"><span className="h-1 w-3 bg-bie-500 rounded-full"></span> Current</div>
            <div className="flex items-center gap-1 text-slate-400"><span className="h-0.5 w-3 bg-slate-300 rounded-full border-t border-dashed"></span> Previous</div>
          </div>
        )}
      </div>
      
      <div className="relative w-full flex-1 overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full min-h-[240px] overflow-visible">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#13795b" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#13795b" stopOpacity="0.0" />
            </linearGradient>
            <style dangerouslySetInnerHTML={{__html: `
              .animate-draw {
                stroke-dasharray: 2000;
                stroke-dashoffset: 2000;
                animation: draw-line 1.2s ease-out forwards;
              }
              .animate-fade-area {
                opacity: 0;
                animation: fade-in 1.2s ease-out forwards;
              }
              @keyframes draw-line { to { stroke-dashoffset: 0; } }
            `}} />
          </defs>

          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(val => {
            const y = paddingY + innerHeight - (val / 100) * innerHeight;
            return (
              <g key={`grid-${val}`}>
                <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                <text x={paddingX - 10} y={y + 4} fontSize="10" fill="#94a3b8" textAnchor="end">{val}%</text>
              </g>
            );
          })}

          {/* Previous Series */}
          {prevPathD && (
            <path d={prevPathD} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" className="animate-draw" />
          )}

          {/* Current Series Area */}
          {areaD && (
            <path d={areaD} fill="url(#areaGradient)" className="animate-fade-area" />
          )}

          {/* Current Series Line */}
          {pathD && (
            <path d={pathD} fill="none" stroke="#13795b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="animate-draw" />
          )}

          {/* X Axis Labels */}
          {data.map((d, i) => {
            // Only show labels occasionally if there are too many (e.g., yearly = 12 is fine, monthly = 31 needs skipping)
            const showLabel = data.length <= 15 || i % Math.ceil(data.length / 10) === 0 || i === data.length - 1;
            if (!showLabel) return null;
            
            const x = paddingX + i * stepX;
            return (
              <text key={`label-${i}`} x={x} y={height - 5} fontSize="10" fill="#64748b" textAnchor="middle">
                {d.label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
