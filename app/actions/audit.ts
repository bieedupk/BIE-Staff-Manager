"use server";

import { createClient } from "@/lib/supabase/server";

export async function logAudit(
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
  options?: { actorId?: string | null }
) {
  const supabase = await createClient();
  let actorId = options?.actorId;

  if (actorId === undefined) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    actorId = user?.id ?? null;
  }

  await supabase.from("audit_logs").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    details: details ?? null
  });
}
