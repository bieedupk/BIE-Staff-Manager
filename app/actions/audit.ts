"use server";

import { createClient } from "@/lib/supabase/server";

export async function logAudit(action: string, entityType: string, entityId?: string | null, details?: Record<string, unknown>) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  await supabase.from("audit_logs").insert({
    actor_id: user?.id ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    details: details ?? null
  });
}
