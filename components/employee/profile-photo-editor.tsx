"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Trash2, Upload, X } from "lucide-react";
import { removeProfilePhoto, uploadProfilePhoto } from "@/app/actions/profile";
import { Avatar } from "@/components/ui/avatar";

type ProfilePhotoEditorProps = {
  initialAvatarUrl?: string | null;
  fullName: string;
};

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_EXTENSIONS = ["image/jpeg", "image/png", "image/webp"];

export function ProfilePhotoEditor({ initialAvatarUrl, fullName }: ProfilePhotoEditorProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(initialAvatarUrl ?? null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function resetFileSelection() {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSuccessMessage(null);
    setErrorMessage(null);

    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_EXTENSIONS.includes(file.type)) {
      setErrorMessage("Only JPEG, PNG, and WebP images are allowed.");
      resetFileSelection();
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage("Image size must be 2 MB or less.");
      resetFileSelection();
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  }

  async function handleUpload() {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("avatar", selectedFile);

      const result = await uploadProfilePhoto(formData);

      if (result.success) {
        setSuccessMessage(result.message || "Profile picture updated.");
        if (result.avatarUrl) {
          setCurrentAvatarUrl(result.avatarUrl);
        }
        resetFileSelection();
        router.refresh();
      } else {
        setErrorMessage(result.error || "Failed to update profile picture.");
      }
    } catch {
      setErrorMessage("An unexpected error occurred while saving your photo.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove() {
    if (isRemoving || isUploading) return;

    setIsRemoving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await removeProfilePhoto();

      if (result.success) {
        setSuccessMessage(result.message || "Profile picture removed.");
        setCurrentAvatarUrl(null);
        resetFileSelection();
        router.refresh();
      } else {
        setErrorMessage(result.error || "Failed to remove profile picture.");
      }
    } catch {
      setErrorMessage("An unexpected error occurred while removing your photo.");
    } finally {
      setIsRemoving(false);
    }
  }

  const displayedAvatar = previewUrl || currentAvatarUrl;
  const isBusy = isUploading || isRemoving;

  return (
    <div className="rounded-lg border border-emerald-100 bg-white p-5 shadow-soft">
      <h2 className="text-base font-extrabold text-slate-950">Profile Picture</h2>
      <p className="mt-0.5 text-xs font-medium text-slate-500">
        Upload a professional photo (JPEG, PNG, or WebP up to 2 MB).
      </p>

      {successMessage ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        {/* Avatar Display */}
        <div className="relative shrink-0">
          <Avatar src={displayedAvatar} name={fullName} size="2xl" />
          {previewUrl ? (
            <span className="absolute -bottom-1 -right-1 rounded-full bg-bie-700 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
              Preview
            </span>
          ) : null}
        </div>

        {/* Action Controls */}
        <div className="flex w-full min-w-0 flex-1 flex-col items-center gap-3 sm:items-start">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={isBusy}
            className="hidden"
            aria-label="Upload profile picture"
          />

          {selectedFile ? (
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                <span className="truncate">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={resetFileSelection}
                  disabled={isBusy}
                  className="ms-2 shrink-0 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                  aria-label="Cancel file selection"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isBusy}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-bie-700 px-4 text-sm font-extrabold text-white shadow-soft transition hover:bg-bie-800 disabled:opacity-50"
                >
                  <Upload size={16} />
                  {isUploading ? "Updating..." : "Save Photo"}
                </button>
                <button
                  type="button"
                  onClick={resetFileSelection}
                  disabled={isBusy}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-bie-700 px-4 text-sm font-extrabold text-white shadow-soft transition hover:bg-bie-800 disabled:opacity-50"
              >
                <Camera size={16} />
                {currentAvatarUrl ? "Change Photo" : "Upload Photo"}
              </button>

              {currentAvatarUrl ? (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={isBusy}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3.5 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  {isRemoving ? "Removing..." : "Remove Photo"}
                </button>
              ) : null}
            </div>
          )}

          <p className="text-center text-xs text-slate-400 sm:text-start">
            Only image files up to 2 MB are supported.
          </p>
        </div>
      </div>
    </div>
  );
}
