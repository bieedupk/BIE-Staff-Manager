"use client";

import { useMemo, useState } from "react";
import { departmentDisplayName } from "@/lib/department-utils";
import type { Department } from "@/lib/types";
import { DEPARTMENT_DESIGNATIONS, GENERAL_ROLES } from "@/lib/employee-options";

type Props = {
  departments: Department[];
  selectedDepartmentIds?: string[];
  otherDepartment?: string;
  defaultDesignation?: string;
};

export function EmployeeAssignmentFields({
  departments,
  selectedDepartmentIds = [],
  otherDepartment = "",
  defaultDesignation = ""
}: Props) {
  const defaultIds = useMemo(() => new Set(selectedDepartmentIds), [selectedDepartmentIds]);
  const [selectedIds, setSelectedIds] = useState(defaultIds);
  const otherDepartmentId = departments.find((department) => departmentDisplayName(department.name) === "Other")?.id ?? "";
  const isOtherSelected = Boolean(otherDepartmentId && selectedIds.has(otherDepartmentId));

  const parsedDesignations = useMemo(() => {
    return defaultDesignation
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [defaultDesignation]);

  const [selectedDesignations, setSelectedDesignations] = useState<Set<string>>(new Set(parsedDesignations));

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

  function toggleDesignation(designation: string, checked: boolean) {
    setSelectedDesignations((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(designation);
      } else {
        next.delete(designation);
      }
      return next;
    });
  }

  const availableDesignations = useMemo(() => {
    const combined = new Set<string>();
    
    selectedIds.forEach((id) => {
      const dept = departments.find((d) => d.id === id);
      if (dept) {
        const name = departmentDisplayName(dept.name);
        if (DEPARTMENT_DESIGNATIONS[name]) {
          DEPARTMENT_DESIGNATIONS[name].forEach((desig) => combined.add(desig));
        }
      }
    });

    GENERAL_ROLES.forEach((role) => combined.add(role));
    parsedDesignations.forEach((desig) => combined.add(desig));

    return Array.from(combined);
  }, [selectedIds, departments, parsedDesignations]);

  return (
    <>
      <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3 md:col-span-2 xl:col-span-3">
        <legend className="px-1 text-sm font-bold text-slate-700">Select departments</legend>
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
          <label className="mt-2 grid gap-1 text-sm font-bold text-slate-700">
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

      <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3 md:col-span-2 xl:col-span-3">
        <legend className="px-1 text-sm font-bold text-slate-700">Select designations</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {availableDesignations.map((designation) => {
            const checked = selectedDesignations.has(designation);

            return (
              <label key={designation} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => toggleDesignation(designation, event.target.checked)}
                />
                <span>{designation}</span>
              </label>
            );
          })}
        </div>
        <input type="hidden" name="designation" value={Array.from(selectedDesignations).join(", ")} />
      </fieldset>
    </>
  );
}
