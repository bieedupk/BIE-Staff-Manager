"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  initialCheckInTime: string;
  initialCheckOutTime: string;
  /** "HH:MM" — the organization-configured duty start time (e.g. "09:00") */
  dutyStartTime: string;
  /** "YYYY-MM-DD" — organization-local today date */
  todayDate: string;
  /** IANA timezone string for the organization (e.g. "Asia/Karachi") */
  timezone: string;
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
  initialCurrentOrgTime,
  initialCorrectionDate
}: Props) {
  const [correctionDate, setCorrectionDate] = useState(initialCorrectionDate);
  const [checkInTime, setCheckInTime] = useState(initialCheckInTime);
  const [checkOutTime, setCheckOutTime] = useState(initialCheckOutTime);
  const [currentOrgTime, setCurrentOrgTime] = useState(
    initialCurrentOrgTime || (timezone ? getOrgLocalTimeHHMM(timezone) : "")
  );

  const checkInRef = useRef<HTMLInputElement>(null);
  const checkOutRef = useRef<HTMLInputElement>(null);

  // Maintain live organization-local time so long-open pages track current time automatically
  useEffect(() => {
    if (!timezone) return;

    const updateTime = () => {
      const liveTime = getOrgLocalTimeHHMM(timezone);
      if (liveTime) {
        setCurrentOrgTime(liveTime);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 30_000);
    return () => clearInterval(interval);
  }, [timezone]);

  // Clear any stale custom validity whenever the live clock updates
  useEffect(() => {
    if (checkInRef.current && checkInRef.current.validationMessage) {
      checkInRef.current.setCustomValidity("");
    }
    if (checkOutRef.current && checkOutRef.current.validationMessage) {
      checkOutRef.current.setCustomValidity("");
    }
  }, [currentOrgTime]);

  const isToday = correctionDate === todayDate;

  // When today is selected, check-in is valid only within [dutyStartTime, currentOrgTime].
  // If the current org time is before duty start (e.g. 07:00 with duty at 08:30),
  // no check-in is possible yet — we disable the field rather than set min > max.
  const checkInMin = dutyStartTime || undefined;
  const checkInMax = isToday ? currentOrgTime : undefined;

  // Edge case: today but current time is before duty start → no valid window yet
  const checkInDisabledToday =
    isToday &&
    Boolean(currentOrgTime) &&
    Boolean(dutyStartTime) &&
    currentOrgTime < dutyStartTime;

  // check-out: if today → max = current org time; otherwise unrestricted
  const checkOutMax = isToday ? currentOrgTime : undefined;

  // check-out: min = check-in time when set
  const checkOutMin = checkInTime || undefined;

  const totalHoursValue = useMemo(() => calculateTotalHours(checkInTime, checkOutTime), [checkInTime, checkOutTime]);

  function handleDateChange(event: React.ChangeEvent<HTMLInputElement>) {
    const newDate = event.target.value;
    setCorrectionDate(newDate);
    // Switching to today: clear check-in if it now exceeds current org time
    if (newDate === todayDate && currentOrgTime) {
      if (checkInTime && checkInTime > currentOrgTime) {
        setCheckInTime("");
      }
      if (checkOutTime && checkOutTime > currentOrgTime) {
        setCheckOutTime("");
      }
    }
  }

  function handleCheckInChange(event: React.ChangeEvent<HTMLInputElement>) {
    event.currentTarget.setCustomValidity("");
    const newCheckIn = event.target.value;
    setCheckInTime(newCheckIn);
    if (checkOutTime && newCheckIn && checkOutTime < newCheckIn) {
      setCheckOutTime("");
    }
  }

  function handleCheckInInvalid(event: React.InvalidEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (input.validity.rangeOverflow) {
      input.setCustomValidity("Enter the current time or an earlier time.");
    } else if (input.validity.rangeUnderflow) {
      input.setCustomValidity("Please select the duty start time or a later time.");
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
    if (input.validity.rangeOverflow) {
      input.setCustomValidity("Enter the current time or an earlier time.");
    } else if (input.validity.rangeUnderflow) {
      input.setCustomValidity("Please select the current time or an earlier time.");
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
        {checkInDisabledToday ? (
          <input
            name="check_in_time"
            type="time"
            value=""
            disabled
            title={dutyStartTime ? `Cannot correct check-in before duty start (${dutyStartTime})` : "Cannot correct check-in before duty start"}
            aria-label="Check in time (disabled before duty start)"
            className="min-h-11 rounded-lg border border-slate-300 px-3 bg-slate-100 text-slate-400 cursor-not-allowed"
          />
        ) : (
          <input
            ref={checkInRef}
            name="check_in_time"
            type="time"
            value={checkInTime}
            min={checkInMin}
            max={checkInMax}
            onChange={handleCheckInChange}
            onInput={handleCheckInInput}
            onInvalid={handleCheckInInvalid}
            className="min-h-11 rounded-lg border border-slate-300 px-3"
          />
        )}
      </label>
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Check out time
        <input
          ref={checkOutRef}
          name="check_out_time"
          type="time"
          value={checkOutTime}
          min={checkOutMin}
          max={checkOutMax}
          onChange={handleCheckOutChange}
          onInput={handleCheckOutInput}
          onInvalid={handleCheckOutInvalid}
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
      </label>
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Total hours
        <input
          name="total_hours"
          type="number"
          min="0"
          step="0.01"
          readOnly
          value={totalHoursValue}
          className="min-h-11 rounded-lg border border-slate-300 px-3 bg-slate-50"
        />
      </label>
    </>
  );
}

function getOrgLocalTimeHHMM(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone
    }).formatToParts(new Date());
    const hour = parts.find((p) => p.type === "hour")?.value ?? "";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "";
    return hour && minute ? `${hour}:${minute}` : "";
  } catch {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

function calculateTotalHours(checkInTime: string, checkOutTime: string) {
  if (!checkInTime || !checkOutTime) return "";

  const parseTime = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const checkInMinutes = parseTime(checkInTime);
  const checkOutMinutes = parseTime(checkOutTime);
  let differenceMinutes = checkOutMinutes - checkInMinutes;

  if (differenceMinutes < 0) {
    differenceMinutes += 24 * 60;
  }

  return (differenceMinutes / 60).toFixed(2);
}
