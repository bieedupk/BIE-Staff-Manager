import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const defaultDepartmentNames = [
  "Administration",
  "Teaching",
  "Examination",
  "Accounts",
  "IT",
  "Admission",
  "Dispatch",
  "Other"
];

export async function ensureDefaultDepartments() {
  const admin = createAdminClient();
  const { error } = await admin.from("departments").upsert(
    defaultDepartmentNames.map((name) => ({
      name,
      is_active: true
    })),
    { onConflict: "name" }
  );

  if (error) {
    throw new Error(`Could not prepare departments: ${error.message}`);
  }
}
