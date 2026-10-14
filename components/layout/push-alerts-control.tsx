"use client";

import { useEffect, useState } from "react";
import { browserPushSubscription, disableBrowserPush, getBrowserPushOwner, setBrowserPushOwner } from "@/lib/push-client";

function decodeVapidKey(key: string) {
  const padding = "=".repeat((4 - (key.length % 4)) % 4);
  const binary = atob((key + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function PushAlertsControl({ profileId }: { profileId: string }) {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const usable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      setSupported(usable);
      if (usable) void browserPushSubscription().then(async (subscription) => {
        if (subscription && getBrowserPushOwner() !== profileId) {
          await subscription.unsubscribe();
          setBrowserPushOwner(null);
          setEnabled(false);
          return;
        }
        setEnabled(Boolean(subscription) && Notification.permission === "granted");
      }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profileId]);

  async function toggleAlerts() {
    setBusy(true);
    setMessage("");
    try {
      if (enabled) {
        await disableBrowserPush();
        setEnabled(false);
        setMessage("Pop-up alerts are off on this browser.");
      } else {
        if (!publicKey) throw new Error("Push is not configured on this site yet.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Allow notifications in your browser settings to enable alerts.");
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(publicKey)
        });
        const response = await fetch("/api/notifications/subscription", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON())
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || "Could not enable pop-up alerts.");
        }
        setEnabled(true);
        setBrowserPushOwner(profileId);
        setMessage("Pop-up alerts are on for this browser.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update notification settings.");
      if (enabled) setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;
  return (
    <div className="border-b border-slate-100 px-4 py-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggleAlerts()}
        className="text-xs font-semibold text-bie-700 disabled:opacity-50"
      >
        {busy ? "Updating…" : enabled ? "Disable pop-up alerts" : "Enable pop-up alerts"}
      </button>
      {message ? <p role="status" className="mt-1 text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
