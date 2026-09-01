import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const AVATAR_BUCKET = "employee-avatars";
const SIGNED_URL_EXPIRES_IN = 3600; // 1 hour

/**
 * Generates a signed URL for a single avatar path.
 * Returns null if path is not provided, storage fails, or bucket does not exist.
 */
export async function getAvatarSignedUrl(avatarPath: string | null | undefined): Promise<string | null> {
  if (!avatarPath) return null;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(avatarPath, SIGNED_URL_EXPIRES_IN);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Batch generates signed URLs for multiple avatar paths in a single Supabase Storage call.
 * Avoids N+1 performance bottlenecks on employee list views.
 */
export async function getAvatarSignedUrls(
  avatarPaths: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const validPaths = [...new Set(avatarPaths.filter(Boolean))] as string[];

  if (validPaths.length === 0) {
    return result;
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(validPaths, SIGNED_URL_EXPIRES_IN);

    if (error || !data) {
      return result;
    }

    data.forEach((item, index) => {
      const path = item.path || validPaths[index];
      if (item.signedUrl && path) {
        result.set(path, item.signedUrl);
      }
    });
  } catch {
    // If storage is not yet initialized or network error occurs, fall back gracefully
  }

  return result;
}
