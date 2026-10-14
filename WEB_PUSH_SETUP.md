# BIE Staff Manager browser alerts

The in-app bell is stored in `public.notifications`. Browser alerts are optional
and use the same records. The app remains usable if a browser blocks push.

## Before deploying

1. Install dependencies with `npm install`, then run `npm run lint`,
   `npm run typecheck`, and `npm run build`.
2. Generate a VAPID key pair once with `npx web-push generate-vapid-keys --json`.
   Keep the private key private. Do not generate new keys for each deployment:
   changing them invalidates existing browser subscriptions.
3. Add these environment variables to the Vercel production project:
   `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`,
   `WEB_PUSH_VAPID_SUBJECT` (a real `mailto:` contact address), and
   `PUSH_WEBHOOK_SECRET` (at least 32 random characters, separate from every
   other service key). The public key is deliberately visible in the browser.
4. Deploy migrations `031_in_app_notifications.sql` and
   `032_web_push_subscriptions.sql` to the linked Supabase project, then deploy
   the application with these environment variables. Do not commit secrets.
5. In Supabase Dashboard > Database > Webhooks, create a webhook on the
   `public.notifications` table for **INSERT only**. Set POST URL to
   `https://bie-staff-manager.vercel.app/api/notifications/dispatch`, add
   HTTP header `x-bie-push-secret` with the exact `PUSH_WEBHOOK_SECRET` value,
   and `Content-Type: application/json`. Never put the secret in the URL.

The webhook sends an event to the application after a notification is written.
The application fetches the row itself and sends a generic push message to the
recipient's subscribed browsers. It does not put names, dates, or leave details
on the device lock screen. If push delivery fails, the in-app notification
remains available. A webhook network failure is not currently retried
automatically; inspect Supabase webhook logs and the application logs if an
expected alert is missing.

## Browser setup and checks

- On an authorized employee computer or admin browser, sign in and click the
  bell, then **Enable pop-up alerts**. Allow the browser permission prompt.
  Permission and subscription are per browser. Desktop operating system
  notifications must also be enabled.
- For iPhone/iPad, add the website to the Home Screen first, open that Home
  Screen app, and then enable notifications. Employee mobile access is still
  blocked by the existing device policy.
- Make a test employee check in: an active admin with push enabled should
  receive a generic system alert and a detailed in-app notification. Click it
  to open the admin attendance page.
- Assign a task and approve/reject a leave request. Verify the intended
  recipient sees an alert in their authorized browser and the in-app bell.
- Sign out, disable the employee device, or reset its WebAuthn session. The
  corresponding browser must no longer receive new employee alerts.
- Test two accounts sharing a browser: only the currently signed-in account
  may register that browser; logging out unsubscribes it first.

Web push needs HTTPS and the user's browser permission. Delivery depends on
browser and operating system push services. The in-app list is the durable
record of every event.
