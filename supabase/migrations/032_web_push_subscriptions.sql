-- Browser push endpoints are secrets. Only the application server may read or
-- change them; clients use authenticated API routes with device checks.
CREATE TABLE public.staff_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  authorized_device_session_id uuid REFERENCES public.authorized_device_sessions(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 20 AND 2048),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 20 AND 256),
  auth_key text NOT NULL CHECK (length(auth_key) BETWEEN 10 AND 256),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_push_subscriptions_user_idx
ON public.staff_push_subscriptions (user_id);

ALTER TABLE public.staff_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_push_subscriptions FROM PUBLIC, anon, authenticated;
