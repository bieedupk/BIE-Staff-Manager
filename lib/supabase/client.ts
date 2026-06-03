"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv, missingSupabaseEnvMessage } from "@/lib/env";

export function createClient() {
  const { url, anonKey } = getPublicSupabaseEnv();

  if (!url || !anonKey) {
    throw new Error(missingSupabaseEnvMessage);
  }

  return createBrowserClient(url, anonKey);
}
