"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";

type Props = ComponentProps<"button"> & {
  pendingText?: string;
};

export function SubmitButton({
  children,
  pendingText,
  disabled,
  className = "",
  type = "submit",
  ...props
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
      className={className}
      {...props}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{pendingText ?? children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
