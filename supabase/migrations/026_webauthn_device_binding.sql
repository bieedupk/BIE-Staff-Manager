-- Migration 026: WebAuthn Device Binding

-- 1. PRE-FLIGHT CHECK: Enforce no duplicate active devices
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT count(*)
    INTO duplicate_count
    FROM (
        SELECT employee_id
        FROM public.authorized_devices
        WHERE status = 'active'
        GROUP BY employee_id
        HAVING count(*) > 1
    ) dupes;

    IF duplicate_count > 0 THEN
        RAISE EXCEPTION 'Cannot proceed: Found % employees with duplicate active devices. Please review and resolve duplicates explicitly before applying WebAuthn migration.', duplicate_count;
    END IF;
END $$;

-- 2. EVOLVE authorized_devices
ALTER TABLE public.authorized_devices
  ADD COLUMN IF NOT EXISTS credential_id text,
  ADD COLUMN IF NOT EXISTS credential_public_key text,
  ADD COLUMN IF NOT EXISTS credential_counter bigint,
  ADD COLUMN IF NOT EXISTS credential_transports text[],
  ADD COLUMN IF NOT EXISTS credential_device_type text,
  ADD COLUMN IF NOT EXISTS credential_backed_up boolean,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_version uuid DEFAULT gen_random_uuid() NOT NULL;

-- Allow legacy device_token_hash to be nullable for v2 WebAuthn devices
ALTER TABLE public.authorized_devices ALTER COLUMN device_token_hash DROP NOT NULL;

-- Partial unique index for one active device per employee
CREATE UNIQUE INDEX IF NOT EXISTS authorized_devices_one_active_idx
ON public.authorized_devices (employee_id)
WHERE status = 'active';

-- Unique index for credential IDs
CREATE UNIQUE INDEX IF NOT EXISTS authorized_devices_credential_id_idx
ON public.authorized_devices (credential_id)
WHERE credential_id IS NOT NULL;

-- Remove legacy authenticated-admin INSERT/UPDATE access
DROP POLICY IF EXISTS authorized_devices_insert_admin ON public.authorized_devices;
DROP POLICY IF EXISTS authorized_devices_update_admin ON public.authorized_devices;
REVOKE INSERT, UPDATE ON public.authorized_devices FROM authenticated, anon;


-- 3. CREATE device_registration_requests
CREATE TABLE IF NOT EXISTS public.device_registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  registration_code text NOT NULL,
  credential_id text NOT NULL,
  credential_public_key text NOT NULL,
  credential_counter bigint NOT NULL,
  transports text[] NOT NULL,
  credential_device_type text NOT NULL,
  credential_backed_up boolean NOT NULL,
  device_name text NOT NULL,
  request_ip text,
  request_user_agent text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Unique active pending registration code to prevent collisions
CREATE UNIQUE INDEX IF NOT EXISTS device_registration_requests_code_idx
ON public.device_registration_requests (registration_code)
WHERE status = 'pending';


-- 4. CREATE authorized_device_sessions
CREATE TABLE IF NOT EXISTS public.authorized_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorized_device_id uuid NOT NULL REFERENCES public.authorized_devices(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  last_ip text,
  last_user_agent text,
  revoked_at timestamptz
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS authorized_device_sessions_token_hash_idx
ON public.authorized_device_sessions (session_token_hash);


-- 5. CREATE device_webauthn_challenges
CREATE TABLE IF NOT EXISTS public.device_webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('registration', 'authentication')),
  challenge text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- 6. ENABLE RLS
ALTER TABLE public.device_registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES
-- device_registration_requests
CREATE POLICY registration_requests_read_employee ON public.device_registration_requests
FOR SELECT TO authenticated
USING (employee_id = auth.uid());

CREATE POLICY registration_requests_read_admin ON public.device_registration_requests
FOR SELECT TO authenticated
USING (public.is_admin_manager());

-- Service role handles inserts/updates to keep requests secure
-- device_webauthn_challenges & authorized_device_sessions are purely service_role managed, so no authenticated policies needed.

-- 8. RPC: approve_device_request
CREATE OR REPLACE FUNCTION public.approve_device_request(
    p_request_id uuid,
    p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_request public.device_registration_requests%ROWTYPE;
    v_new_device_id uuid;
    v_actor_role text;
    v_employee_id uuid;
    v_revoked_count int;
BEGIN
    -- Ensure actor is a valid admin/super_admin
    SELECT role INTO v_actor_role FROM public.profiles WHERE id = p_actor_id AND status = 'active';
    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only active admins can approve device requests.';
    END IF;

    -- Lock the employee profile first to serialize concurrent operations
    SELECT employee_id INTO v_employee_id
    FROM public.device_registration_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found.';
    END IF;

    PERFORM 1 FROM public.profiles WHERE id = v_employee_id FOR UPDATE;

    -- Lock the request row
    SELECT * INTO v_request
    FROM public.device_registration_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found.';
    END IF;

    IF v_request.status != 'pending' THEN
        RAISE EXCEPTION 'Request is no longer pending (current status: %).', v_request.status;
    END IF;

    IF v_request.expires_at < now() THEN
        RAISE EXCEPTION 'Request has expired.';
    END IF;

    IF v_request.credential_device_type = 'multiDevice' OR v_request.credential_backed_up = true THEN
        RAISE EXCEPTION 'Cannot approve synced or multi-device credentials. Must be a platform-bound authenticator.';
    END IF;

    -- Disable old active devices for this employee
    UPDATE public.authorized_devices
    SET status = 'disabled'
    WHERE employee_id = v_request.employee_id AND status = 'active';

    -- Revoke old sessions for this employee
    WITH revoked AS (
        UPDATE public.authorized_device_sessions
        SET revoked_at = now()
        WHERE employee_id = v_request.employee_id AND revoked_at IS NULL
        RETURNING id
    )
    SELECT count(*) INTO v_revoked_count FROM revoked;

    IF v_revoked_count > 0 THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES (p_actor_id, 'device_session_revoked', 'profiles', v_request.employee_id, jsonb_build_object('revoked_count', v_revoked_count));
    END IF;

    -- Create the new authorized device
    INSERT INTO public.authorized_devices (
        employee_id,
        device_name,
        device_token_hash,
        status,
        registered_by,
        registered_at,
        credential_id,
        credential_public_key,
        credential_counter,
        credential_transports,
        credential_device_type,
        credential_backed_up,
        approved_at,
        approved_by
    ) VALUES (
        v_request.employee_id,
        v_request.device_name,
        NULL, -- v2 device has no static token hash
        'active',
        p_actor_id,
        v_request.requested_at,
        v_request.credential_id,
        v_request.credential_public_key,
        v_request.credential_counter,
        v_request.transports,
        v_request.credential_device_type,
        v_request.credential_backed_up,
        now(),
        p_actor_id
    ) RETURNING id INTO v_new_device_id;

    -- Mark request as approved
    UPDATE public.device_registration_requests
    SET
        status = 'approved',
        reviewed_at = now(),
        reviewed_by = p_actor_id
    WHERE id = p_request_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        p_actor_id,
        'device_registration_approved',
        'authorized_devices',
        v_new_device_id,
        jsonb_build_object(
            'employee_id', v_request.employee_id,
            'request_id', p_request_id
        )
    );

    RETURN v_new_device_id;
END;
$$;

-- Revoke public execution
REVOKE EXECUTE ON FUNCTION public.approve_device_request(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.approve_device_request(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_device_request(uuid, uuid) FROM anon;

CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request_per_employee
ON public.device_registration_requests (employee_id)
WHERE status = 'pending';

GRANT EXECUTE ON FUNCTION public.approve_device_request(uuid, uuid) TO service_role;

-- RPC: reject_device_request
CREATE OR REPLACE FUNCTION public.reject_device_request(
    p_request_id uuid,
    p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_request public.device_registration_requests%ROWTYPE;
    v_actor_role text;
BEGIN
    SELECT role INTO v_actor_role FROM public.profiles WHERE id = p_actor_id AND status = 'active';
    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only active admins can reject device requests.';
    END IF;

    SELECT * INTO v_request
    FROM public.device_registration_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found.';
    END IF;

    IF v_request.status != 'pending' THEN
        RAISE EXCEPTION 'Request is no longer pending (current status: %).', v_request.status;
    END IF;

    UPDATE public.device_registration_requests
    SET
        status = 'rejected',
        reviewed_at = now(),
        reviewed_by = p_actor_id
    WHERE id = p_request_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_id, 'device_registration_rejected', 'device_registration_requests', p_request_id,
        jsonb_build_object('employee_id', v_request.employee_id)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_device_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_device_request(uuid, uuid) TO service_role;

-- RPC: reset_authorized_device
CREATE OR REPLACE FUNCTION public.reset_authorized_device(
    p_employee_id uuid,
    p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role text;
    v_disabled_count int;
    v_employee_email text;
    v_revoked_count int;
BEGIN
    SELECT role INTO v_actor_role FROM public.profiles WHERE id = p_actor_id AND status = 'active';
    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    PERFORM 1 FROM public.profiles WHERE id = p_employee_id FOR UPDATE;
    SELECT email INTO v_employee_email FROM public.profiles WHERE id = p_employee_id;

    WITH updated AS (
        UPDATE public.authorized_devices
        SET status = 'disabled'
        WHERE employee_id = p_employee_id AND status = 'active'
        RETURNING id
    )
    SELECT count(*) INTO v_disabled_count FROM updated;

    WITH revoked AS (
        UPDATE public.authorized_device_sessions
        SET revoked_at = now()
        WHERE employee_id = p_employee_id AND revoked_at IS NULL
        RETURNING id
    )
    SELECT count(*) INTO v_revoked_count FROM revoked;

    IF v_revoked_count > 0 THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES (p_actor_id, 'device_session_revoked', 'profiles', p_employee_id, jsonb_build_object('revoked_count', v_revoked_count));
    END IF;

    UPDATE public.device_registration_requests
    SET status = 'expired'
    WHERE employee_id = p_employee_id AND status = 'pending';

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_id, 'device_reset', 'profiles', p_employee_id,
        jsonb_build_object('employee_email', v_employee_email, 'disabled_devices', v_disabled_count)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_authorized_device(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_authorized_device(uuid, uuid) TO service_role;

-- RPC: disable_authorized_device
CREATE OR REPLACE FUNCTION public.disable_authorized_device(
    p_employee_id uuid,
    p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role text;
    v_disabled_id uuid;
    v_employee_email text;
    v_revoked_count int;
BEGIN
    SELECT role INTO v_actor_role FROM public.profiles WHERE id = p_actor_id AND status = 'active';
    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Unauthorized.';
    END IF;

    PERFORM 1 FROM public.profiles WHERE id = p_employee_id FOR UPDATE;
    SELECT email INTO v_employee_email FROM public.profiles WHERE id = p_employee_id;

    UPDATE public.authorized_devices
    SET status = 'disabled'
    WHERE employee_id = p_employee_id AND status = 'active'
    RETURNING id INTO v_disabled_id;

    IF v_disabled_id IS NULL THEN
        RAISE EXCEPTION 'No active device found to disable.';
    END IF;

    WITH revoked AS (
        UPDATE public.authorized_device_sessions
        SET revoked_at = now()
        WHERE employee_id = p_employee_id AND revoked_at IS NULL
        RETURNING id
    )
    SELECT count(*) INTO v_revoked_count FROM revoked;

    IF v_revoked_count > 0 THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES (p_actor_id, 'device_session_revoked', 'profiles', p_employee_id, jsonb_build_object('revoked_count', v_revoked_count));
    END IF;

    UPDATE public.device_registration_requests
    SET status = 'expired'
    WHERE employee_id = p_employee_id AND status = 'pending';

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (
        p_actor_id, 'device_disabled', 'authorized_devices', v_disabled_id,
        jsonb_build_object('employee_id', p_employee_id, 'employee_email', v_employee_email, 'disabled_devices', 1)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.disable_authorized_device(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disable_authorized_device(uuid, uuid) TO service_role;

-- 5a. CREATE webauthn_rate_limits
CREATE TABLE IF NOT EXISTS public.webauthn_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webauthn_rate_limits_idx ON public.webauthn_rate_limits(employee_id, action, created_at);

ALTER TABLE public.webauthn_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webauthn_rate_limits FROM anon, authenticated;

-- RPC for rate limiting
CREATE OR REPLACE FUNCTION public.check_webauthn_rate_limit(
    p_employee_id uuid,
    p_action text,
    p_max_requests int,
    p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_recent_count int;
BEGIN
    PERFORM 1 FROM public.profiles WHERE id = p_employee_id FOR UPDATE;

    DELETE FROM public.webauthn_rate_limits
    WHERE employee_id = p_employee_id
      AND action = p_action
      AND created_at < now() - (p_window_seconds || ' seconds')::interval;

    SELECT count(*) INTO v_recent_count
    FROM public.webauthn_rate_limits
    WHERE employee_id = p_employee_id AND action = p_action;

    IF v_recent_count >= p_max_requests THEN
        RETURN false;
    END IF;

    INSERT INTO public.webauthn_rate_limits (employee_id, action) VALUES (p_employee_id, p_action);
    RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.check_webauthn_rate_limit(uuid, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_webauthn_rate_limit(uuid, text, int, int) TO service_role;

-- RPC: create_device_registration_request
CREATE OR REPLACE FUNCTION public.create_device_registration_request(
    p_employee_id uuid, p_code text, p_cred_id text, p_cred_pub_key text,
    p_cred_counter bigint, p_transports text[], p_dev_type text,
    p_backed_up boolean, p_dev_name text, p_ip text, p_ua text, p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req_id uuid;
BEGIN
    INSERT INTO public.device_registration_requests (
        employee_id, registration_code, credential_id, credential_public_key,
        credential_counter, transports, credential_device_type, credential_backed_up,
        device_name, request_ip, request_user_agent, expires_at
    ) VALUES (
        p_employee_id, p_code, p_cred_id, p_cred_pub_key, p_cred_counter,
        p_transports, p_dev_type, p_backed_up, p_dev_name, p_ip, p_ua, p_expires_at
    ) RETURNING id INTO v_req_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (p_employee_id, 'device_registration_requested', 'device_registration_requests', v_req_id, jsonb_build_object('device_name', p_dev_name));

    RETURN v_req_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_device_registration_request(uuid, text, text, text, bigint, text[], text, boolean, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_device_registration_request(uuid, text, text, text, bigint, text[], text, boolean, text, text, text, timestamptz) TO service_role;

-- RPC: create_authorized_device_session
CREATE OR REPLACE FUNCTION public.create_authorized_device_session(
    p_device_id uuid, p_employee_id uuid, p_token_hash text,
    p_expires_at timestamptz, p_ip text, p_ua text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session_id uuid;
    v_device_status text;
BEGIN
    SELECT status INTO v_device_status
    FROM public.authorized_devices
    WHERE id = p_device_id AND employee_id = p_employee_id
    FOR UPDATE;

    IF NOT FOUND OR v_device_status != 'active' THEN
        RAISE EXCEPTION 'Device is not active or does not belong to this employee.';
    END IF;

    INSERT INTO public.authorized_device_sessions (
        authorized_device_id, employee_id, session_token_hash,
        expires_at, last_used_at, last_ip, last_user_agent
    ) VALUES (
        p_device_id, p_employee_id, p_token_hash,
        p_expires_at, now(), p_ip, p_ua
    ) RETURNING id INTO v_session_id;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
    VALUES (p_employee_id, 'device_webauthn_verified', 'authorized_devices', p_device_id, jsonb_build_object('session_id', v_session_id));

    RETURN v_session_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_authorized_device_session(uuid, uuid, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_authorized_device_session(uuid, uuid, text, timestamptz, text, text) TO service_role;

-- RPC: revoke_device_session
CREATE OR REPLACE FUNCTION public.revoke_device_session(
    p_token_hash text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session_id uuid;
    v_employee_id uuid;
BEGIN
    UPDATE public.authorized_device_sessions
    SET revoked_at = now()
    WHERE session_token_hash = p_token_hash AND revoked_at IS NULL
    RETURNING id, employee_id INTO v_session_id, v_employee_id;

    IF v_session_id IS NOT NULL THEN
        INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
        VALUES (v_employee_id, 'device_session_revoked', 'authorized_device_sessions', v_session_id, jsonb_build_object('reason', 'logout'));
        RETURN true;
    END IF;

    RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_device_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_device_session(text) TO service_role;
