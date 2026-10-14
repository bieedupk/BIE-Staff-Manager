import "server-only";

const serviceHosts = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "webpush.push.apple.com"
]);

export function isTrustedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.port && (serviceHosts.has(url.hostname) || url.hostname.endsWith(".notify.windows.com"));
  } catch {
    return false;
  }
}

export function isNotificationDestination(href: string) {
  return /^\/(admin|employee)\/[a-z0-9/_-]*$/.test(href) || href === "/device-access";
}
