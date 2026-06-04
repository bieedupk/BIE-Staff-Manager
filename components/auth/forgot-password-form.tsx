"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(String(formData.get("email")), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
    });

    if (resetError) {
      setError("Recovery email could not be sent. Please contact admin.");
    } else {
      setMessage("If this email exists, a reset link has been sent.");
    }
    setLoading(false);
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
        {loading ? "Sending..." : "Send Reset Link"}
      </button>
    </form>
  );
}
