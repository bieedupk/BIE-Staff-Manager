"use client";

import { useEffect, useRef, useState } from "react";

export function EmployeeMoreOptions({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative border-t border-slate-100 bg-slate-50/50 p-2 text-center" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded-md py-1.5 text-[13px] font-bold text-slate-500 transition hover:bg-slate-100 hover:text-bie-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700"
        aria-expanded={isOpen}
      >
        More Options
        <svg
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen ? (
        <div className="absolute top-full left-2 right-2 z-20 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl ring-1 ring-black/5 sm:left-1/2 sm:w-[320px] sm:-translate-x-1/2">
          {children}
        </div>
      ) : null}
    </div>
  );
}