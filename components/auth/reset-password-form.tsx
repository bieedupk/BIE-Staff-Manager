"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const invalidResetLinkMessage =
  "Your reset link is expired or invalid. Please request a new password reset link.";

export function ResetPasswordForm() {
  const initializedRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function checkRecoverySession() {
      const supabase = createClient();
      try {
        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          setError(invalidResetLinkMessage);
          setSessionReady(false);
          return;
        }

        setSessionReady(true);
        setError("");
      } catch {
        setError(invalidResetLinkMessage);
        setSessionReady(false);
      } finally {
        setSessionLoading(false);
      }
    }

    void checkRecoverySession();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionReady) {
      setError(invalidResetLinkMessage);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirm_password") || "");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      setError(readableResetError(sessionError?.message));
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(readableResetError(updateError.message));
      setLoading(false);
      return;
    }

    setMessage("Password updated successfully. Redirecting to login...");
    await supabase.auth.signOut();
    document.cookie = "bie_remember_me=; path=/; max-age=0; SameSite=Lax";
    window.setTimeout(() => {
      window.location.assign("/login?message=password-updated");
    }, 1200);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        New password
        <div className="relative flex items-center">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={loading || sessionLoading || !sessionReady}
            className="min-h-11 w-full rounded-lg border border-slate-300 pe-11 ps-3 outline-none focus:border-bie-600 focus:ring-4 focus:ring-emerald-100"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            disabled={loading || sessionLoading || !sessionReady}
            className="absolute end-0 flex size-11 items-center justify-center text-slate-500 hover:text-bie-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 rounded-e-lg disabled:opacity-50"
          >
            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      </label>
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        Confirm password
        <div className="relative flex items-center">
          <input
            name="confirm_password"
            type={showConfirmPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={loading || sessionLoading || !sessionReady}
            className="min-h-11 w-full rounded-lg border border-slate-300 pe-11 ps-3 outline-none focus:border-bie-600 focus:ring-4 focus:ring-emerald-100"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            disabled={loading || sessionLoading || !sessionReady}
            className="absolute end-0 flex size-11 items-center justify-center text-slate-500 hover:text-bie-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 rounded-e-lg disabled:opacity-50"
          >
            {showConfirmPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      </label>
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
      <button
        type="submit"
        disabled={loading || sessionLoading || !sessionReady}
        className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white hover:bg-bie-900 disabled:opacity-60"
      >
        {loading
          ? "Updating..."
          : sessionLoading
            ? "Preparing reset link..."
            : sessionReady
              ? "Update Password"
              : "Reset link unavailable"}
      </button>
    </form>
  );
}

function readableResetError(message?: string) {
  const normalizedMessage = (message || "").toLowerCase();

  if (
    !message ||
    normalizedMessage.includes("invalid refresh token") ||
    normalizedMessage.includes("refresh token not found") ||
    normalizedMessage.includes("auth session missing") ||
    normalizedMessage.includes("session missing") ||
    normalizedMessage.includes("expired")
  ) {
    return invalidResetLinkMessage;
  }

  return message || "Password could not be updated. Please request a new reset link.";
}
