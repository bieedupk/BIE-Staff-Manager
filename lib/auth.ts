import { redirect } from "next/navigation";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";
import { isAdminManagerRole, isAdminRole } from "@/lib/utils";

export async function getProfileByUserId(userId: string, options: { includeDisabled?: boolean } = {}) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabase = createAdminClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single<Profile>();

  if (error || !profile || (!options.includeDisabled && profile.status !== "active")) {
    return null;
  }

  return profile;
}

export async function getCurrentProfile() {
  if (!hasPublicSupabaseEnv()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  return getProfileByUserId(user.id);
}

export async function requireProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdminProfile() {
  const profile = await requireProfile();
  if (!isAdminRole(profile.role)) redirect("/employee/dashboard");
  return profile;
}

export async function requireAdminManagerProfile() {
  const profile = await requireProfile();
  if (!isAdminManagerRole(profile.role)) redirect("/admin/dashboard");
  return profile;
}

export async function requireEmployeeProfile() {
  const profile = await requireProfile();
  if (isAdminRole(profile.role)) redirect("/admin/dashboard");
  return profile;
}

export function homeForRole(role: UserRole) {
  return isAdminRole(role) ? "/admin/dashboard" : "/employee/dashboard";
}
