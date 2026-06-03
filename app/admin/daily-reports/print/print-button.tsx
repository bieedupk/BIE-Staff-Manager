"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-control rounded-lg bg-bie-700 px-4 py-3 text-sm font-extrabold text-white"
    >
      Print / Save as PDF
    </button>
  );
}
