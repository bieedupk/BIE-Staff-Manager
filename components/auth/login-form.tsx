"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { authServiceUnavailableMessage, missingSupabaseEnvMessage } from "@/lib/env";

type LoginResponse = {
  error?: unknown;
  redirectTo?: string;
};

function readableLoginError(errorValue: unknown) {
  if (typeof errorValue === "string" && errorValue.trim()) return errorValue;

  if (errorValue && typeof errorValue === "object") {
    const errorRecord = errorValue as Record<string, unknown>;
    const candidates = [errorRecord.message, errorRecord.error_description, errorRecord.details];
    const message = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());

    if (typeof message === "string") return message;
  }

  return "Login failed. Please try again.";
}

function loginErrorMessage(code: string | null) {
  if (code === "disabled") return "Your account is disabled. Please contact administration.";
  if (code === "inactive") return "Your account is inactive or missing a staff profile.";
  if (code === "employee_mobile") return "Employee access is allowed only from an authorized office computer.";
  if (code === "unauthorized_device") return "This device is not authorized. Please contact administration.";
  if (code === "recovery") return "Password reset link is invalid or expired. Please request a new link.";
  return "";
}

function loginSuccessMessage(code: string | null) {
  if (code === "password-updated") return "Password updated successfully. Please log in with your new password.";
  return "";
}

export function LoginForm({ supabaseConfigured = true }: { supabaseConfigured?: boolean }) {
  const searchParams = useSearchParams();
  const initialError = loginErrorMessage(searchParams.get("error"));
  const initialMessage = loginSuccessMessage(searchParams.get("message"));
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState(initialMessage);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabaseConfigured) {
      setError(missingSupabaseEnvMessage);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const next = searchParams.get("next");
    if (next) formData.set("next", next);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
        signal: controller.signal
      });
      const result = (await response.json().catch(() => ({}))) as LoginResponse;

      if (!response.ok || result.error) {
        setError(result.error ? readableLoginError(result.error) : "Login failed. Please check your email and password.");
        setLoading(false);
        return;
      }

      if (!result.redirectTo) {
        setError("Login succeeded, but no dashboard route was returned.");
        setLoading(false);
        return;
      }

      window.location.assign(result.redirectTo);
    } catch (loginError) {
      setError(
        loginError instanceof Error && loginError.name === "AbortError"
          ? "Login request timed out. Please try again."
          : authServiceUnavailableMessage
      );
      setLoading(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={!supabaseConfigured}
          className="min-h-11 rounded-lg border border-slate-300 px-3 outline-none focus:border-bie-600 focus:ring-4 focus:ring-emerald-100"
        />
      </label>
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        Password
        <div className="relative flex items-center">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={!supabaseConfigured}
            className="min-h-11 w-full rounded-lg border border-slate-300 pe-11 ps-3 outline-none focus:border-bie-600 focus:ring-4 focus:ring-emerald-100"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            disabled={!supabaseConfigured}
            className="absolute end-0 flex size-11 items-center justify-center text-slate-500 hover:text-bie-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bie-700 rounded-e-lg disabled:opacity-50"
          >
            {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      </label>
      <div className="flex items-center justify-between">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            name="remember_me"
            type="checkbox"
            value="true"
            defaultChecked={true}
            className="size-4 rounded border-slate-300 text-bie-700 accent-bie-700 focus:ring-bie-600"
          />
          Remember Me
        </label>
      </div>
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
      <button
        type="submit"
        disabled={loading || !supabaseConfigured}
        className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white hover:bg-bie-900 disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Login"}
      </button>
    </form>
  );
}
