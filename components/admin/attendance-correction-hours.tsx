"use client";

import { useMemo, useState } from "react";

type Props = {
  initialCheckInTime: string;
  initialCheckOutTime: string;
  /** "HH:MM" — the organization-configured duty start time (e.g. "09:00") */
  dutyStartTime: string;
  /** "YYYY-MM-DD" — organization-local today date */
  todayDate: string;
  /** "HH:MM" — current organization-local time (server-computed at render time) */
  currentOrgTime: string;
  /** "YYYY-MM-DD" — the work_date of the record being corrected */
  initialCorrectionDate: string;
};

export function AttendanceCorrectionHours({
  initialCheckInTime,
  initialCheckOutTime,
  dutyStartTime,
  todayDate,
  currentOrgTime,
  initialCorrectionDate
}: Props) {
  const [correctionDate, setCorrectionDate] = useState(initialCorrectionDate);
  const [checkInTime, setCheckInTime] = useState(initialCheckInTime);
  const [checkOutTime, setCheckOutTime] = useState(initialCheckOutTime);

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
    const newCheckIn = event.target.value;
    setCheckInTime(newCheckIn);
    if (checkOutTime && newCheckIn && checkOutTime < newCheckIn) {
      setCheckOutTime("");
    }
  }

  function handleCheckOutChange(event: React.ChangeEvent<HTMLInputElement>) {
    setCheckOutTime(event.target.value);
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
          <>
            <input
              name="check_in_time"
              type="time"
              value=""
              disabled
              className="min-h-11 rounded-lg border border-slate-300 px-3 bg-slate-100 text-slate-400 cursor-not-allowed"
            />
            <span className="text-xs font-normal text-amber-600">
              Cannot correct check-in before duty start ({dutyStartTime})
            </span>
          </>
        ) : (
          <>
            <input
              name="check_in_time"
              type="time"
              value={checkInTime}
              min={checkInMin}
              max={checkInMax}
              onChange={handleCheckInChange}
              className="min-h-11 rounded-lg border border-slate-300 px-3"
            />
            {isToday && checkInMin && checkInMax ? (
              <span className="text-xs font-normal text-slate-500">
                {checkInMin}–{checkInMax} (duty start to current time)
              </span>
            ) : checkInMin ? (
              <span className="text-xs font-normal text-slate-500">Earliest: {checkInMin} (duty start)</span>
            ) : null}
          </>
        )}
      </label>
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Check out time
        <input
          name="check_out_time"
          type="time"
          value={checkOutTime}
          min={checkOutMin}
          max={checkOutMax}
          onChange={handleCheckOutChange}
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
        {isToday && currentOrgTime ? (
          <span className="text-xs font-normal text-slate-500">Latest: {currentOrgTime} (current time)</span>
        ) : null}
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
