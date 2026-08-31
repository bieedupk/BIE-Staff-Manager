"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  timezone: string;
  serverNow?: string | number;
};

export function LiveClock({ timezone, serverNow }: Props) {
  const serverStartMs = useRef<number | null>(null);
  const mountPerfMs = useRef<number | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    serverStartMs.current =
      typeof serverNow === "number" ? serverNow : serverNow ? new Date(serverNow).getTime() : Date.now();
    mountPerfMs.current = typeof performance !== "undefined" ? performance.now() : Date.now();

    const updateTime = () => {
      const baseMs = serverStartMs.current ?? Date.now();
      const mountMs = mountPerfMs.current ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
      const currentPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = currentPerf - mountMs;
      setNow(new Date(baseMs + elapsed));
    };

    updateTime();
    const intervalId = window.setInterval(updateTime, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [serverNow]);

  return (
    <section className="inline-flex min-h-12 items-center rounded-xl border border-emerald-200/90 bg-white/95 px-4 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_10px_30px_rgba(16,185,129,0.16)]">
      <p className="text-lg font-extrabold text-slate-950">{now ? formatClockTime(now, timezone) : "--:--:-- --"}</p>
    </section>
  );
}

function formatClockTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: safeTimezone(timezone)
  }).format(date);
}

function safeTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-PK", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "Asia/Karachi";
  }
}
