"use client";

export function ResetTestReportButton() {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (!window.confirm("Reset the selected test daily report? Attendance will not be deleted.")) {
          event.preventDefault();
        }
      }}
      className="self-end min-h-11 rounded-lg border border-amber-300 px-4 text-sm font-extrabold text-amber-800"
    >
      Reset Test Daily Report
    </button>
  );
}
