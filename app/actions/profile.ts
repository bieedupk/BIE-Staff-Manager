"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { AVATAR_BUCKET } from "@/lib/avatar";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type AvatarActionResult = {
  success: boolean;
  message?: string;
  error?: string;
  avatarUrl?: string | null;
};

/**
 * Uploads/replaces the authenticated user's own profile photo.
 * Strictly resolves profile ownership server-side; client cannot specify target employeeId.
 */
export async function uploadProfilePhoto(formData: FormData): Promise<AvatarActionResult> {
  try {
    const profile = await requireProfile();
    const file = formData.get("avatar") as File | null;

    if (!file || typeof file === "string" || file.size === 0) {
      return { success: false, error: "Please select an image file to upload." };
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      return { success: false, error: "Image size must be 2 MB or less." };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { success: false, error: "Only JPEG, PNG, and WebP images are allowed." };
    }

    const storagePath = `employees/${profile.id}/avatar`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = createAdminClient();

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      console.error("[uploadProfilePhoto] Storage upload error:", uploadError);
      const isBucketMissing =
        uploadError.message?.toLowerCase().includes("bucket") ||
        uploadError.message?.toLowerCase().includes("not found");

      return {
        success: false,
        error: isBucketMissing
          ? "Storage bucket 'employee-avatars' is not yet configured in Supabase. Please apply migration 016."
          : `Failed to upload image: ${uploadError.message}`
      };
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_path: storagePath })
      .eq("id", profile.id);

    if (updateError) {
      console.error("[uploadProfilePhoto] Profile update error:", updateError);
      return { success: false, error: "Failed to update profile record with new photo." };
    }

    // Generate a fresh signed URL for instant UI preview
    const { data: signedData } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(storagePath, 3600);

    revalidatePath("/employee/profile");
    revalidatePath("/employee/dashboard");
    revalidatePath("/admin/profile");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/employees");
    revalidatePath(`/admin/employees/${profile.id}`);

    return {
      success: true,
      message: "Profile picture updated.",
      avatarUrl: signedData?.signedUrl ?? null
    };
  } catch (error) {
    console.error("[uploadProfilePhoto] Unexpected error:", error);
    return { success: false, error: "An unexpected error occurred while uploading profile picture." };
  }
}

/**
 * Removes the authenticated user's own profile photo.
 * Strictly resolves profile ownership server-side.
 */
export async function removeProfilePhoto(): Promise<AvatarActionResult> {
  try {
    const profile = await requireProfile();
    const supabase = createAdminClient();
    const storagePath = profile.avatar_path || `employees/${profile.id}/avatar`;

    // Attempt to delete from storage (ignore error if file does not exist)
    await supabase.storage.from(AVATAR_BUCKET).remove([storagePath]);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_path: null })
      .eq("id", profile.id);

    if (updateError) {
      console.error("[removeProfilePhoto] Profile update error:", updateError);
      return { success: false, error: "Failed to clear profile picture record." };
    }

    revalidatePath("/employee/profile");
    revalidatePath("/employee/dashboard");
    revalidatePath("/admin/profile");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/employees");
    revalidatePath(`/admin/employees/${profile.id}`);

    return {
      success: true,
      message: "Profile picture removed.",
      avatarUrl: null
    };
  } catch (error) {
    console.error("[removeProfilePhoto] Unexpected error:", error);
    return { success: false, error: "An unexpected error occurred while removing profile picture." };
  }
}
