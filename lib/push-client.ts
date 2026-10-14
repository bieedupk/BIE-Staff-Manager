"use client";

const ownerKey = "bie_push_owner";

export function getBrowserPushOwner() {
  return window.localStorage.getItem(ownerKey);
}

export function setBrowserPushOwner(userId: string | null) {
  if (userId) window.localStorage.setItem(ownerKey, userId);
  else window.localStorage.removeItem(ownerKey);
}

export async function browserPushSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.pushManager.getSubscription() ?? null;
}

export async function disableBrowserPush() {
  const subscription = await browserPushSubscription();
  if (!subscription) {
    setBrowserPushOwner(null);
    return;
  }
  try {
    await fetch("/api/notifications/subscription", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
      signal: AbortSignal.timeout(2500)
    });
  } finally {
    // Even if the API is unavailable, stop this browser receiving pushes.
    await subscription.unsubscribe();
    setBrowserPushOwner(null);
  }
}
