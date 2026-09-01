import React from "react";

type Props = {
  value: number; // 0-100
  previousValue?: number;
  label: string;
};

export function AttendanceGauge({ value, previousValue, label }: Props) {
  // We'll draw a semicircular SVG gauge.
  const radius = 60;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * Math.PI;
  // Dashoffset based on value 0-100
  const strokeDashoffset = circumference - (value / 100) * circumference;

  let comparisonText = null;
  let compColor = "text-slate-500";
  if (previousValue !== undefined) {
    const delta = value - previousValue;
    if (delta > 0) {
      comparisonText = `+${Math.round(delta)}%`;
      compColor = "text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded";
    } else if (delta < 0) {
      comparisonText = `${Math.round(delta)}%`;
      compColor = "text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded";
    } else {
      comparisonText = "No change";
      compColor = "text-slate-500 text-xs";
    }
  }

  return (
    <div className="flex w-full flex-col items-center justify-center pt-2">
      <div className="relative flex items-end justify-center h-[90px] w-full max-w-[200px] overflow-hidden">
        <svg
          height={radius * 2}
          width={radius * 2}
          className="absolute bottom-0 translate-y-1/2"
        >
          {/* Background Arc */}
          <path
            stroke="#f1f5f9" // slate-100
            fill="transparent"
            strokeWidth={stroke}
            strokeLinecap="round"
            d={`M ${stroke * 2} ${radius} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${radius * 2 - stroke * 2} ${radius}`}
          />
          {/* Foreground Arc */}
          <path
            stroke="currentColor"
            fill="transparent"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference} // start empty for animation
            className="text-bie-600 motion-safe:animate-draw-line"
            style={{
              // @ts-ignore - using CSS variable to pass the target offset for keyframes
              "--target-offset": strokeDashoffset,
              animationName: "draw-gauge"
            }}
            d={`M ${stroke * 2} ${radius} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${radius * 2 - stroke * 2} ${radius}`}
          />
        </svg>
        
        {/* Value overlay */}
        <div className="absolute bottom-0 flex flex-col items-center justify-end pb-1">
          <span className="text-3xl font-extrabold text-slate-900 leading-none">
            {Math.round(value)}%
          </span>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">{label}</span>
        </div>
      </div>
      
      {previousValue !== undefined && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <span>Previous: {Math.round(previousValue)}%</span>
          <span className="h-3 w-[1px] bg-slate-200" />
          <span className={`flex items-center ${compColor}`}>{comparisonText}</span>
        </div>
      )}
      
      {/* Dynamic Keyframe for this specific dashoffset */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes draw-gauge {
          to {
            stroke-dashoffset: ${strokeDashoffset};
          }
        }
      `}} />
    </div>
  );
}
