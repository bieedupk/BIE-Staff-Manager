"use client";

import { useEffect, useState } from "react";

type Props = {
  timezone: string;
};

export function LiveClock({ timezone }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setNow(new Date());
    }, 0);

    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

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
