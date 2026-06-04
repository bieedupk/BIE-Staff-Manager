"use client";

import { useMemo, useState } from "react";
import { departmentDisplayName } from "@/lib/department-utils";
import type { Department } from "@/lib/types";

type Props = {
  departments: Department[];
  selectedDepartmentIds?: string[];
  otherDepartment?: string;
  label?: string;
};

export function DepartmentAssignmentFields({
  departments,
  selectedDepartmentIds = [],
  otherDepartment = "",
  label = "Select departments"
}: Props) {
  const defaultIds = useMemo(() => new Set(selectedDepartmentIds), [selectedDepartmentIds]);
  const [selectedIds, setSelectedIds] = useState(defaultIds);
  const otherDepartmentId = departments.find((department) => departmentDisplayName(department.name) === "Other")?.id ?? "";
  const isOtherSelected = Boolean(otherDepartmentId && selectedIds.has(otherDepartmentId));

  function toggleDepartment(departmentId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(departmentId);
      } else {
        next.delete(departmentId);
      }
      return next;
    });
  }

  return (
    <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3 md:col-span-2 xl:col-span-3">
      <legend className="px-1 text-sm font-bold text-slate-700">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((department) => {
          const displayName = departmentDisplayName(department.name);
          const checked = selectedIds.has(department.id);

          return (
            <label key={department.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                name="department_ids"
                value={department.id}
                checked={checked}
                onChange={(event) => toggleDepartment(department.id, event.target.checked)}
              />
              <span>{displayName}</span>
            </label>
          );
        })}
      </div>
      {isOtherSelected ? (
        <label className="grid gap-1 text-sm font-bold text-slate-700">
          Write department name
          <input
            name="other_department"
            defaultValue={otherDepartment}
            required
            className="min-h-11 rounded-lg border border-slate-300 px-3"
            dir="auto"
          />
        </label>
      ) : null}
    </fieldset>
  );
}
