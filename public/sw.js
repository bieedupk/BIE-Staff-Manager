const CACHE_NAME = "bie-staff-manager-v1";
const CORE_ASSETS = ["/", "/login", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((response) => response || caches.match("/login"))));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const href = typeof data.href === "string" &&
    (/^\/(admin|employee)\/[a-z0-9/_-]*$/.test(data.href) || data.href === "/device-access")
    ? data.href : "/";
  event.waitUntil(self.registration.showNotification("BIE Staff Manager", {
    body: "You have a new update. Open the app to view it.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: typeof data.id === "string" ? data.id : undefined,
    data: { href }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(href);
      return existing.focus();
    }
    return self.clients.openWindow(href);
  })());
});
