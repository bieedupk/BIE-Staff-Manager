"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDurationMinutes, getOrgCurrentTimeHHMM } from "@/lib/utils";

type Props = {
  initialCheckInTime: string;
  initialCheckOutTime: string;
  /** "HH:MM" — the organization-configured duty start time (e.g. "09:00") */
  dutyStartTime: string;
  /** "YYYY-MM-DD" — organization-local today date */
  todayDate: string;
  /** IANA timezone string for the organization (e.g. "Asia/Karachi") */
  timezone: string;
  /** Server timestamp at render for monotonic client time progression */
  serverNow?: string | number;
  /** Optional initial "HH:MM" computed during server render */
  initialCurrentOrgTime?: string;
  /** "YYYY-MM-DD" — the work_date of the record being corrected */
  initialCorrectionDate: string;
};

export function AttendanceCorrectionHours({
  initialCheckInTime,
  initialCheckOutTime,
  dutyStartTime,
  todayDate,
  timezone,
  serverNow,
  initialCurrentOrgTime,
  initialCorrectionDate
}: Props) {
  const serverStartMs = useRef<number | null>(null);
  const mountPerfMs = useRef<number | null>(null);
  const [correctionDate, setCorrectionDate] = useState(initialCorrectionDate);
  const [checkInTime, setCheckInTime] = useState(initialCheckInTime);
  const [checkOutTime, setCheckOutTime] = useState(initialCheckOutTime);
  const [currentOrgTime, setCurrentOrgTime] = useState(initialCurrentOrgTime ?? "");

  const checkInRef = useRef<HTMLInputElement>(null);
  const checkOutRef = useRef<HTMLInputElement>(null);

  // Maintain live organization-local time so long-open pages track current time automatically via monotonic elapsed time
  useEffect(() => {
    serverStartMs.current =
      typeof serverNow === "number" ? serverNow : serverNow ? new Date(serverNow).getTime() : Date.now();
    mountPerfMs.current = typeof performance !== "undefined" ? performance.now() : Date.now();

    if (!timezone) return;

    const updateTime = () => {
      const baseMs = serverStartMs.current ?? Date.now();
      const mountMs = mountPerfMs.current ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
      const currentPerf = typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = currentPerf - mountMs;
      const monotonicDate = new Date(baseMs + elapsed);
      const liveTime = getOrgCurrentTimeHHMM(timezone, monotonicDate);
      if (liveTime) {
        setCurrentOrgTime(liveTime);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 30_000);
    return () => clearInterval(interval);
  }, [timezone, serverNow]);

  // Clear any stale custom validity whenever the live clock or correction date updates
  useEffect(() => {
    if (checkInRef.current && checkInRef.current.validationMessage) {
      checkInRef.current.setCustomValidity("");
    }
    if (checkOutRef.current && checkOutRef.current.validationMessage) {
      checkOutRef.current.setCustomValidity("");
    }
  }, [currentOrgTime, correctionDate]);

  const isToday = correctionDate === todayDate;

  // Check-in rule (same for today and historical): checkInTime >= dutyStartTime
  const checkInMin = dutyStartTime || undefined;

  // Check-out: if today → max = current org time; for past dates → no current-time max
  const checkOutMax = isToday && currentOrgTime ? currentOrgTime : undefined;

  const calculatedDuration = useMemo(() => {
    if (!checkInTime || !checkOutTime) {
      return { decimalHours: "", displayDuration: "" };
    }

    const [inH, inM] = checkInTime.split(":").map(Number);
    const [outH, outM] = checkOutTime.split(":").map(Number);
    const inMins = inH * 60 + inM;
    const outMins = outH * 60 + outM;
    let diff = outMins - inMins;

    if (diff < 0) {
      diff += 24 * 60;
    }

    const decimalHours = String(Number((diff / 60).toFixed(2)));
    const displayDuration = formatDurationMinutes(diff);
    return { decimalHours, displayDuration };
  }, [checkInTime, checkOutTime]);

  function handleDateChange(event: React.ChangeEvent<HTMLInputElement>) {
    const newDate = event.target.value;
    setCorrectionDate(newDate);

    // Immediately clear any existing validation errors when date changes
    if (checkInRef.current) checkInRef.current.setCustomValidity("");
    if (checkOutRef.current) checkOutRef.current.setCustomValidity("");

    // Switching to today: clear check-out if it exceeds current org time
    if (newDate === todayDate && currentOrgTime && checkOutTime && checkOutTime > currentOrgTime) {
      setCheckOutTime("");
    }
  }

  function handleCheckInChange(event: React.ChangeEvent<HTMLInputElement>) {
    event.currentTarget.setCustomValidity("");
    setCheckInTime(event.target.value);
  }

  function handleCheckInInvalid(event: React.InvalidEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (input.validity.rangeUnderflow) {
      input.setCustomValidity("Check-in time cannot be earlier than the duty start time.");
    } else {
      input.setCustomValidity("");
    }
  }

  function handleCheckInInput(event: React.FormEvent<HTMLInputElement>) {
    event.currentTarget.setCustomValidity("");
  }

  function handleCheckOutChange(event: React.ChangeEvent<HTMLInputElement>) {
    event.currentTarget.setCustomValidity("");
    setCheckOutTime(event.target.value);
  }

  function handleCheckOutInvalid(event: React.InvalidEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (isToday && input.validity.rangeOverflow) {
      input.setCustomValidity("Enter the current time or an earlier time.");
    } else {
      input.setCustomValidity("");
    }
  }

  function handleCheckOutInput(event: React.FormEvent<HTMLInputElement>) {
    event.currentTarget.setCustomValidity("");
  }

  return (
    <>
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Correction date
        <input
          name="correction_date"
          type="date"
          required
          value={correctionDate}
          max={todayDate}
          onChange={handleDateChange}
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
      </label>
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Check in time
        <input
          ref={checkInRef}
          name="check_in_time"
          type="time"
          value={checkInTime}
          min={checkInMin}
          onChange={handleCheckInChange}
          onInput={handleCheckInInput}
          onInvalid={handleCheckInInvalid}
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
      </label>
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Check out time
        <input
          ref={checkOutRef}
          name="check_out_time"
          type="time"
          value={checkOutTime}
          max={checkOutMax}
          onChange={handleCheckOutChange}
          onInput={handleCheckOutInput}
          onInvalid={handleCheckOutInvalid}
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
      </label>
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Total hours
        <input type="hidden" name="total_hours" value={calculatedDuration.decimalHours} />
        <input
          type="text"
          readOnly
          value={calculatedDuration.displayDuration}
          className="min-h-11 rounded-lg border border-slate-300 px-3 bg-slate-50 text-slate-800"
        />
      </label>
    </>
  );
}
