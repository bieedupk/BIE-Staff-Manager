import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const defaultDepartmentNames = [
  "Finance",
  "Administration",
  "Examinations",
  "Admissions & Registration",
  "Information Technology (IT)",
  "Mail & Dispatch",
  "Paper Setting",
  "Syllabus",
  "Research",
  "Teaching",
  "Other"
];

export const defaultDepartmentSortOrders = new Map(defaultDepartmentNames.map((name, index) => [name, index + 1]));

export async function ensureDefaultDepartments() {
  const admin = createAdminClient();
  const { error } = await admin.from("departments").upsert(
    defaultDepartmentNames.map((name) => ({
      name,
      is_active: true,
      sort_order: defaultDepartmentSortOrders.get(name) ?? null
    })),
    { onConflict: "name" }
  );

  if (error) {
    throw new Error(`Could not prepare departments: ${error.message}`);
  }
}
