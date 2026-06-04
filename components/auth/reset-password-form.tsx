"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || "Password could not be updated. Please request a new reset link.");
      setLoading(false);
      return;
    }

    setMessage("Password updated successfully. Redirecting to login...");
    await supabase.auth.signOut();
    window.setTimeout(() => {
      window.location.assign("/login");
    }, 1200);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={loading}
          className="min-h-11 rounded-lg border border-slate-300 px-3 outline-none focus:border-bie-600 focus:ring-4 focus:ring-emerald-100"
        />
      </label>
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        Confirm password
        <input
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={loading}
          className="min-h-11 rounded-lg border border-slate-300 px-3 outline-none focus:border-bie-600 focus:ring-4 focus:ring-emerald-100"
        />
      </label>
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {message ? <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="min-h-11 rounded-lg bg-bie-700 px-4 font-extrabold text-white hover:bg-bie-900 disabled:opacity-60"
      >
        {loading ? "Updating..." : "Update Password"}
      </button>
    </form>
  );
}
