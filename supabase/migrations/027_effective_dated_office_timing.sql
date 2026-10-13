-- Office hours are effective from a work date, never retroactive.
-- Preflight: this organization changed from 08:30-17:00 (late after 09:00)
-- to 06:00-15:00 on 2026-10-12. Stop if the live settings do not match.
DO $$
DECLARE
  v_settings public.organization_settings%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_settings FROM public.organization_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;
  IF v_settings.office_start_time <> time '06:00'
     OR v_settings.office_end_time <> time '15:00'
     OR v_settings.timezone <> 'Asia/Karachi' THEN
    RAISE EXCEPTION 'Unexpected live office hours; review the effective dates before running migration 027';
  END IF;
END;
$$;

CREATE TABLE public.office_timing_history (
  organization_id uuid NOT NULL REFERENCES public.organization_settings(id),
  effective_from date NOT NULL,
  timezone text NOT NULL,
  office_start_time time NOT NULL,
  office_end_time time NOT NULL,
  late_threshold_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, effective_from)
);

ALTER TABLE public.office_timing_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.office_timing_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.office_timing_history TO service_role;

INSERT INTO public.office_timing_history
  (organization_id, effective_from, timezone, office_start_time, office_end_time, late_threshold_time)
VALUES
  ('00000000-0000-0000-0000-000000000001', date '0001-01-01', 'Asia/Karachi', time '08:30', time '17:00', time '09:00');

INSERT INTO public.office_timing_history
  (organization_id, effective_from, timezone, office_start_time, office_end_time, late_threshold_time)
SELECT id, date '2026-10-12', timezone, office_start_time, office_end_time, late_threshold_time
FROM public.organization_settings
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Only the server action may change both the current settings and the dated
-- history; one transaction and a row lock keep concurrent edits in order.
DROP POLICY IF EXISTS organization_settings_admin_insert ON public.organization_settings;
DROP POLICY IF EXISTS organization_settings_admin_update ON public.organization_settings;
REVOKE INSERT, UPDATE ON public.organization_settings FROM anon, authenticated;

CREATE FUNCTION public.update_office_timing(
  p_actor_id uuid,
  p_settings_id uuid,
  p_timezone text,
  p_office_start_time time,
  p_office_end_time time,
  p_late_threshold_time time
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.organization_settings%ROWTYPE;
  v_effective_from date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_actor_id AND role IN ('admin', 'super_admin') AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Admin manager required';
  END IF;
  IF p_timezone IS NULL OR trim(p_timezone) = ''
     OR p_office_start_time IS NULL OR p_office_end_time IS NULL OR p_late_threshold_time IS NULL THEN
    RAISE EXCEPTION 'Office timing is incomplete';
  END IF;
  -- PostgreSQL validates the IANA timezone name here.
  PERFORM now() AT TIME ZONE p_timezone;
  SELECT * INTO STRICT v_settings FROM public.organization_settings
  WHERE id = p_settings_id FOR UPDATE;
  v_effective_from := (now() AT TIME ZONE v_settings.timezone)::date;

  UPDATE public.organization_settings SET
    timezone = p_timezone,
    office_start_time = p_office_start_time,
    office_end_time = p_office_end_time,
    late_threshold_time = p_late_threshold_time
  WHERE id = p_settings_id;

  INSERT INTO public.office_timing_history
    (organization_id, effective_from, timezone, office_start_time, office_end_time, late_threshold_time)
  VALUES
    (p_settings_id, v_effective_from, p_timezone, p_office_start_time, p_office_end_time, p_late_threshold_time)
  ON CONFLICT (organization_id, effective_from) DO UPDATE SET
    timezone = EXCLUDED.timezone,
    office_start_time = EXCLUDED.office_start_time,
    office_end_time = EXCLUDED.office_end_time,
    late_threshold_time = EXCLUDED.late_threshold_time;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (p_actor_id, 'office_timing_updated', 'organization_settings', p_settings_id,
    jsonb_build_object('effective_from', v_effective_from,
      'old_start', v_settings.office_start_time, 'old_end', v_settings.office_end_time,
      'old_late_after', v_settings.late_threshold_time,
      'new_start', p_office_start_time, 'new_end', p_office_end_time,
      'new_late_after', p_late_threshold_time));
END;
$$;
REVOKE ALL ON FUNCTION public.update_office_timing(uuid, uuid, text, time, time, time) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_office_timing(uuid, uuid, text, time, time, time) TO service_role;

-- The previous check-in RPC used a fixed 09:30 threshold even after the
-- organization settings changed. Both punch RPCs now use the dated schedule.
CREATE OR REPLACE FUNCTION public.check_in_today()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.organization_settings%ROWTYPE;
  v_timing public.office_timing_history%ROWTYPE;
  v_today date;
  v_new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO STRICT v_settings FROM public.organization_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid FOR SHARE;
  v_today := (now() AT TIME ZONE v_settings.timezone)::date;
  SELECT * INTO STRICT v_timing FROM public.office_timing_history
  WHERE organization_id = v_settings.id AND effective_from <= v_today
  ORDER BY effective_from DESC LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.leave_requests
             WHERE employee_id = auth.uid() AND status = 'Approved'
               AND v_today BETWEEN from_date AND to_date) THEN
    RAISE EXCEPTION 'Approved leave exists for today';
  END IF;

  INSERT INTO public.attendance (employee_id, work_date, check_in_at, status)
  VALUES (auth.uid(), v_today, now(),
    CASE WHEN (now() AT TIME ZONE v_timing.timezone)::time > v_timing.late_threshold_time
      THEN 'Late'::public.attendance_status ELSE 'Present'::public.attendance_status END)
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Attendance already exists for today';
END;
$$;

CREATE OR REPLACE FUNCTION public.check_out_today()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings public.organization_settings%ROWTYPE;
  v_timing public.office_timing_history%ROWTYPE;
  v_today date;
  v_existing public.attendance%ROWTYPE;
  v_worked_hours numeric(6, 2);
  v_duty_minutes numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO STRICT v_settings FROM public.organization_settings
  WHERE id = '00000000-0000-0000-0000-000000000001'::uuid FOR SHARE;
  v_today := (now() AT TIME ZONE v_settings.timezone)::date;
  SELECT * INTO STRICT v_timing FROM public.office_timing_history
  WHERE organization_id = v_settings.id AND effective_from <= v_today
  ORDER BY effective_from DESC LIMIT 1;
  SELECT * INTO v_existing FROM public.attendance
  WHERE employee_id = auth.uid() AND work_date = v_today FOR UPDATE;

  IF v_existing.id IS NULL OR v_existing.check_in_at IS NULL THEN
    RAISE EXCEPTION 'Please check in before checking out';
  END IF;
  IF v_existing.check_out_at IS NOT NULL THEN
    RAISE EXCEPTION 'Attendance already checked out for today';
  END IF;
  v_worked_hours := round((extract(epoch FROM (now() - v_existing.check_in_at)) / 3600)::numeric, 2);
  v_duty_minutes := extract(epoch FROM (v_timing.office_end_time - v_timing.office_start_time)) / 60;
  IF v_duty_minutes <= 0 THEN v_duty_minutes := v_duty_minutes + 1440; END IF;

  UPDATE public.attendance SET
    check_out_at = now(), total_hours = v_worked_hours,
    status = CASE
      WHEN v_worked_hours <= v_duty_minutes / 120 THEN 'Half Day'::public.attendance_status
      WHEN (v_existing.check_in_at AT TIME ZONE v_timing.timezone)::time > v_timing.late_threshold_time
        THEN 'Late'::public.attendance_status
      ELSE 'Present'::public.attendance_status END
  WHERE id = v_existing.id;
END;
$$;

-- Repair only objectively false late statuses under the old 09:00 rule.
-- Keep correction_count and punch times untouched, and record every repair.
WITH repaired AS (
  UPDATE public.attendance SET
    status = CASE WHEN total_hours <= 4.25
      THEN 'Half Day'::public.attendance_status
      ELSE 'Present'::public.attendance_status END,
    updated_at = now()
  WHERE work_date < date '2026-10-12'
    AND status = 'Late'::public.attendance_status
    AND check_in_at IS NOT NULL AND check_out_at IS NOT NULL
    AND (check_in_at AT TIME ZONE 'Asia/Karachi')::time <= time '09:00'
    AND total_hours IS NOT NULL
  RETURNING id, employee_id, work_date, status
)
INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
SELECT NULL, 'attendance_status_repaired', 'attendance', id,
  jsonb_build_object('employee_id', employee_id, 'work_date', work_date,
    'old_status', 'Late', 'new_status', status, 'reason', '2026-10-12 office timing change')
FROM repaired;

NOTIFY pgrst, 'reload schema';
