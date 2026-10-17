"use client";

import { useState } from "react";

const ALL_ACTIVE_EMPLOYEES = "__all_active_employees__";

type EmployeeOption = { id: string; name: string };

export function TaskRecipientPicker({ employees, allowAll, disabled }: {
  employees: EmployeeOption[];
  allowAll: boolean;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"selected" | "all">("selected");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const isAll = allowAll && mode === "all";
  const matches = employees.filter((employee) => employee.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const selectionLabel = isAll ? "All active employees" : selected.size === 1
    ? employees.find((employee) => selected.has(employee.id))?.name ?? "1 employee selected"
    : selected.size ? `${selected.size} employees selected` : "Select employees";

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 text-sm font-bold text-slate-700">
      <legend>Assign to</legend>
      <details className="group relative mt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
          <span className="truncate">{selectionLabel}</span>
          <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="absolute left-0 top-full z-30 mt-1 max-h-80 w-full min-w-64 overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 shadow-lg">
          {allowAll ? (
            <div className="mb-3 grid gap-2 border-b border-slate-200 pb-3 font-medium">
              <label className="flex items-center gap-2">
                <input type="radio" name="recipient_mode" value="selected" checked={!isAll} onChange={() => setMode("selected")} />
                Selected employees
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="recipient_mode" value="all" checked={isAll} onChange={() => setMode("all")} />
                All active employees
              </label>
            </div>
          ) : null}
          {!isAll ? (
            <>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                Find employee
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name"
                  className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </label>
              <div className="mt-3 grid gap-1">
                {matches.length ? matches.map((employee) => (
                  <label key={employee.id} className="flex min-h-9 items-center gap-2 rounded px-1 font-medium text-slate-800 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.has(employee.id)}
                      onChange={() => toggle(employee.id)}
                      className="size-4 accent-emerald-700"
                    />
                    <span>{employee.name}</span>
                  </label>
                )) : <p className="text-sm font-medium text-slate-500">No matching employees.</p>}
              </div>
              {selected.size ? (
                <button type="button" onClick={() => setSelected(new Set())} className="mt-2 text-xs font-semibold text-bie-700 underline">
                  Clear selection ({selected.size})
                </button>
              ) : null}
            </>
          ) : <p className="text-xs font-medium text-slate-500">Each active employee will receive a separate task.</p>}
        </div>
      </details>
      {isAll ? <input type="hidden" name="assigned_to" value={ALL_ACTIVE_EMPLOYEES} /> : [...selected].map((id) => (
        <input key={id} type="hidden" name="assigned_to" value={id} />
      ))}
      <p className="mt-1 text-xs font-medium text-slate-500">{isAll ? "All active employees" : `${selected.size} selected`} · A separate task per employee.</p>
    </fieldset>
  );
}
