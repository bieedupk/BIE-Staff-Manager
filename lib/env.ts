export function getPublicSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
}

export function getServerSupabaseEnv() {
  return {
    ...getPublicSupabaseEnv(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

export function isValidSupabaseUrl(url: string | undefined): url is string {
  return Boolean(url && url.startsWith("https://"));
}

export function hasPublicSupabaseEnv() {
  const { url, anonKey } = getPublicSupabaseEnv();
  return Boolean(isValidSupabaseUrl(url) && anonKey);
}

export const missingSupabaseEnvMessage =
  "Supabase configuration is missing. Please check .env.local.";

export const authServiceUnavailableMessage =
  "Unable to connect to authentication service. Please check Supabase configuration.";
