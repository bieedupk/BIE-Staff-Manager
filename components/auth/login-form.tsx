"use client";

import { useState } from "react";
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
  return "";
}

export function LoginForm({ supabaseConfigured = true }: { supabaseConfigured?: boolean }) {
  const searchParams = useSearchParams();
  const initialError = loginErrorMessage(searchParams.get("error"));
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabaseConfigured) {
      setError(missingSupabaseEnvMessage);
      return;
    }

    setLoading(true);
    setError("");

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
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={!supabaseConfigured}
          className="min-h-11 rounded-lg border border-slate-300 px-3 outline-none focus:border-bie-600 focus:ring-4 focus:ring-emerald-100"
        />
      </label>
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
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
