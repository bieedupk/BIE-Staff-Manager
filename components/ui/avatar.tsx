"use client";

import { useState } from "react";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const sizeClasses: Record<AvatarSize, { container: string; text: string }> = {
  xs: { container: "size-7", text: "text-[11px]" },
  sm: { container: "size-9", text: "text-xs" },
  md: { container: "size-11", text: "text-sm" },
  lg: { container: "size-14", text: "text-base" },
  xl: { container: "size-20", text: "text-xl" },
  "2xl": { container: "size-24", text: "text-2xl" }
};

export function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

type AvatarProps = {
  src?: string | null;
  name: string;
  size?: AvatarSize;
  className?: string;
  alt?: string;
};

export function Avatar({ src, name, size = "md", className = "", alt }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const initials = getInitials(name);
  const sizeConfig = sizeClasses[size] || sizeClasses.md;

  const showImage = Boolean(src && failedSrc !== src);

  return (
    <div
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-extrabold tracking-wider ${sizeConfig.container} ${
        showImage ? "bg-slate-100" : "border border-emerald-200 bg-emerald-100 text-emerald-900"
      } ${className}`}
      aria-label={alt || name}
    >
      {showImage ? (
        // Standard img tag to allow signed URLs and data URLs without next/image host restrictions
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src!}
          alt={alt || `${name}'s profile photo`}
          onError={() => setFailedSrc(src!)}
          className="size-full rounded-full object-cover"
        />
      ) : (
        <span className={sizeConfig.text}>{initials}</span>
      )}
    </div>
  );
}
