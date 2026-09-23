-- Migration 025: Atomic Attendance Correction
-- Dedicated RPC to update/insert attendance and log audit safely.

CREATE OR REPLACE FUNCTION public.correct_attendance_atomic(
  p_id uuid, -- NULL if synthetic
  p_employee_id uuid,
  p_work_date date,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_status text,
  p_total_hours numeric,
  p_correction_reason text,
  p_actor_id uuid,
  p_is_synthetic boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_actor_status text;
  v_leave_exists boolean;
  v_attendance_row public.attendance%ROWTYPE;
  v_new_id uuid;
  v_new_count smallint;
  v_audit_details jsonb;
  v_effective_employee_id uuid;
BEGIN
  -- 1. Validate Actor Security
  SELECT role::text, status::text INTO v_actor_role, v_actor_status
  FROM public.profiles
  WHERE id = p_actor_id;

  IF NOT FOUND OR v_actor_status <> 'active' THEN
    RAISE EXCEPTION 'Unauthorized actor';
  END IF;

  IF v_actor_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Actor lacks admin manager privileges';
  END IF;

  -- 2. Validate Inputs
  IF NULLIF(trim(p_correction_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Correction reason is required';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('Present', 'Late', 'Half Day', 'Absent', 'Leave') THEN
    RAISE EXCEPTION 'Invalid attendance status';
  END IF;

  -- 3. Resolve Employee Authority and Lock Row
  IF p_is_synthetic THEN
    v_effective_employee_id := p_employee_id;
  ELSE
    SELECT * INTO v_attendance_row FROM public.attendance WHERE id = p_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Attendance record not found';
    END IF;

    IF v_attendance_row.employee_id <> p_employee_id THEN
      RAISE EXCEPTION 'Employee mismatch for existing record';
    END IF;

    v_effective_employee_id := v_attendance_row.employee_id;

    IF v_attendance_row.correction_count >= 2 THEN
      RAISE EXCEPTION 'Correction limit reached';
    END IF;
  END IF;

  -- 4. Approved Leave Check
  SELECT EXISTS (
    SELECT 1 FROM public.leave_requests
    WHERE employee_id = v_effective_employee_id
      AND status = 'Approved'
      AND from_date <= p_work_date
      AND to_date >= p_work_date
  ) INTO v_leave_exists;

  IF v_leave_exists THEN
    RAISE EXCEPTION 'Approved leave exists for target date';
  END IF;

  -- 5. Mutate Attendance (with unique violation capture)
  BEGIN
    IF p_is_synthetic THEN
      INSERT INTO public.attendance (
        employee_id, work_date, check_in_at, check_out_at, status, total_hours, correction_count, updated_at
      ) VALUES (
        v_effective_employee_id, p_work_date, p_check_in_at, p_check_out_at, p_status::public.attendance_status, p_total_hours, 1, now()
      ) RETURNING id INTO v_new_id;

      v_new_count := 1;

      v_audit_details := jsonb_build_object(
        'old_check_in_at', null,
        'old_check_out_at', null,
        'old_status', 'Absent',
        'old_total_hours', null,
        'old_work_date', p_work_date,
        'new_check_in_at', p_check_in_at,
        'new_check_out_at', p_check_out_at,
        'new_status', p_status,
        'new_total_hours', p_total_hours,
        'new_work_date', p_work_date,
        'correction_reason', p_correction_reason,
        'new_correction_count', 1,
        'created_from_synthetic', true
      );
    ELSE
      v_new_id := p_id;
      v_new_count := v_attendance_row.correction_count + 1;

      UPDATE public.attendance
      SET
        work_date = p_work_date,
        check_in_at = p_check_in_at,
        check_out_at = p_check_out_at,
        status = p_status::public.attendance_status,
        total_hours = p_total_hours,
        correction_count = v_new_count,
        updated_at = now()
      WHERE id = p_id;

      v_audit_details := jsonb_build_object(
        'old_check_in_at', v_attendance_row.check_in_at,
        'old_check_out_at', v_attendance_row.check_out_at,
        'old_status', v_attendance_row.status,
        'old_total_hours', v_attendance_row.total_hours,
        'old_work_date', v_attendance_row.work_date,
        'new_check_in_at', p_check_in_at,
        'new_check_out_at', p_check_out_at,
        'new_status', p_status,
        'new_total_hours', p_total_hours,
        'new_work_date', p_work_date,
        'correction_reason', p_correction_reason,
        'new_correction_count', v_new_count
      );
    END IF;
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM LIKE '%attendance_employee_id_work_date_key%' THEN
      RAISE EXCEPTION 'Target date already contains attendance';
    ELSE
      RAISE;
    END IF;
  END;

  -- 6. Insert Audit
  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, details
  ) VALUES (
    p_actor_id, 'attendance_corrected', 'attendance', v_new_id, v_audit_details
  );

  RETURN jsonb_build_object('id', v_new_id, 'correction_count', v_new_count);
END;
$$;

REVOKE ALL ON FUNCTION public.correct_attendance_atomic(uuid, uuid, date, timestamptz, timestamptz, text, numeric, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_attendance_atomic(uuid, uuid, date, timestamptz, timestamptz, text, numeric, text, uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
