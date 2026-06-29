"use client";

import { useMemo, useState } from "react";

type Props = {
  initialCheckInTime: string;
  initialCheckOutTime: string;
};

export function AttendanceCorrectionHours({ initialCheckInTime, initialCheckOutTime }: Props) {
  const [checkInTime, setCheckInTime] = useState(initialCheckInTime);
  const [checkOutTime, setCheckOutTime] = useState(initialCheckOutTime);

  const totalHoursValue = useMemo(() => calculateTotalHours(checkInTime, checkOutTime), [checkInTime, checkOutTime]);

  return (
    <>
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Check in time
        <input
          name="check_in_time"
          type="time"
          value={checkInTime}
          onChange={(event) => setCheckInTime(event.target.value)}
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
      </label>
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Check out time
        <input
          name="check_out_time"
          type="time"
          value={checkOutTime}
          onChange={(event) => setCheckOutTime(event.target.value)}
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
