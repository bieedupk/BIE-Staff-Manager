"use client";

import { useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";

export function DeviceAccessClient({
  hasActiveDevice,
  activeDeviceName,
  pendingRequest
}: {
  hasActiveDevice: boolean;
  activeDeviceName?: string;
  pendingRequest: any;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRegisterOverride, setShowRegisterOverride] = useState(false);

  const handleRegister = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/webauthn/register/options", { method: "POST" });
      const options = await resp.json();

      if (!resp.ok) throw new Error(options.error || "Failed to get options");

      let attResp;
      try {
        attResp = await startRegistration({ optionsJSON: options });
      } catch (e: unknown) {
        throw new Error((e as Error).message || "Registration cancelled or failed.");
      }

      const verifyResp = await fetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: attResp,
          deviceName: navigator.userAgent.substring(0, 50) + " computer"
        })
      });

      const verifyData = await verifyResp.json();
      if (!verifyResp.ok) throw new Error(verifyData.error || "Verification failed");

      router.refresh();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/webauthn/authenticate/options", { method: "POST" });
      const options = await resp.json();

      if (!resp.ok) throw new Error(options.error || "Failed to get options");

      let asseResp;
      try {
        asseResp = await startAuthentication({ optionsJSON: options });
      } catch (e: unknown) {
        throw new Error((e as Error).message || "Authentication cancelled or failed.");
      }

      const verifyResp = await fetch("/api/webauthn/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: asseResp })
      });

      const verifyData = await verifyResp.json();
      if (!verifyResp.ok) throw new Error(verifyData.error || "Verification failed");

      // Success, redirect to dashboard
      window.location.href = "/employee/dashboard";
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (pendingRequest) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm font-semibold text-slate-600">You have a pending device registration request.</p>
        <div className="rounded-lg bg-slate-100 p-6 shadow-inner w-full">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Registration Code</p>
          <p className="text-3xl font-mono font-black text-bie-700 tracking-[0.2em]">{pendingRequest.registration_code}</p>
        </div>
        <p className="text-sm text-slate-600">Please provide this code to administration to approve your computer.</p>
        <button
          onClick={() => router.refresh()}
          className="mt-2 text-sm font-bold text-bie-700 hover:underline"
        >
          Check Approval Status
        </button>
      </div>
    );
  }

  const showVerify = hasActiveDevice && !showRegisterOverride;
  const showRegister = !hasActiveDevice || showRegisterOverride;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {showVerify && (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-sm font-medium text-slate-600">
            This account is bound to an authorized computer ({activeDeviceName || "Windows PC"}).
          </p>
          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full rounded-lg bg-bie-700 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-bie-800 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify this authorized computer"}
          </button>
          <button
            onClick={() => setShowRegisterOverride(true)}
            disabled={loading}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 underline"
          >
            Request replacement computer
          </button>
        </div>
      )}

      {showRegister && (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-sm font-medium text-slate-600">
            This computer must be registered and approved by administration.
          </p>
          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Registering..." : "Register this computer"}
          </button>

          {hasActiveDevice && (
            <button
              onClick={() => setShowRegisterOverride(false)}
              disabled={loading}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 underline mt-2"
            >
              Cancel replacement
            </button>
          )}
        </div>
      )}
    </div>
  );
}
