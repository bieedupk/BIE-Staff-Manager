-- Joining date remains the original employment date. Attendance tracking starts
-- at system_entry_date; this does not alter any existing attendance records.
ALTER TABLE public.profiles
  ADD COLUMN father_name text,
  ADD COLUMN system_entry_date date,
  ADD COLUMN attendance_schedule text NOT NULL DEFAULT 'unspecified'
    CHECK (attendance_schedule IN ('unspecified', 'weekly_friday', 'monthly_four', 'bimonthly_eight')),
  ADD COLUMN schedule_effective_from date;

-- The attendance system went live on 13 October 2026. Existing staff may have
-- joined years earlier, but their unrecorded pre-launch days are not absences.
UPDATE public.profiles
SET system_entry_date = GREATEST(DATE '2026-10-13', (created_at AT TIME ZONE 'Asia/Karachi')::date);

UPDATE public.profiles SET schedule_effective_from = system_entry_date;

ALTER TABLE public.profiles
  ALTER COLUMN system_entry_date SET DEFAULT (timezone('Asia/Karachi', now())::date),
  ALTER COLUMN system_entry_date SET NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN schedule_effective_from SET DEFAULT (timezone('Asia/Karachi', now())::date),
  ALTER COLUMN schedule_effective_from SET NOT NULL;

CREATE TABLE public.employee_schedule_history (
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  attendance_schedule text NOT NULL
    CHECK (attendance_schedule IN ('unspecified', 'weekly_friday', 'monthly_four', 'bimonthly_eight')),
  PRIMARY KEY (employee_id, effective_from)
);

INSERT INTO public.employee_schedule_history (employee_id, effective_from, attendance_schedule)
SELECT id, system_entry_date, attendance_schedule FROM public.profiles;

CREATE FUNCTION public.record_employee_schedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.employee_schedule_history (employee_id, effective_from, attendance_schedule)
    VALUES (NEW.id, NEW.schedule_effective_from, NEW.attendance_schedule)
    ON CONFLICT (employee_id, effective_from) DO UPDATE
      SET attendance_schedule = EXCLUDED.attendance_schedule;
  ELSIF NEW.attendance_schedule IS DISTINCT FROM OLD.attendance_schedule THEN
    IF OLD.attendance_schedule = 'unspecified' THEN
      DELETE FROM public.employee_schedule_history
      WHERE employee_id = NEW.id AND attendance_schedule = 'unspecified';
    END IF;
    INSERT INTO public.employee_schedule_history (employee_id, effective_from, attendance_schedule)
    VALUES (NEW.id, NEW.schedule_effective_from, NEW.attendance_schedule)
    ON CONFLICT (employee_id, effective_from) DO UPDATE
      SET attendance_schedule = EXCLUDED.attendance_schedule;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_employee_schedule() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER record_employee_schedule_after_insert
AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.record_employee_schedule();
CREATE TRIGGER record_employee_schedule_after_update
AFTER UPDATE OF attendance_schedule ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.record_employee_schedule();

REVOKE ALL ON public.employee_schedule_history FROM anon, authenticated;
ALTER TABLE public.employee_schedule_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.office_holidays (
  holiday_date date PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.office_holidays FROM anon, authenticated;
ALTER TABLE public.office_holidays ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.profiles.father_name IS 'Father name as recorded by administration.';
COMMENT ON COLUMN public.profiles.system_entry_date IS 'First date this person was entered into the attendance system; separate from employment joining date.';
COMMENT ON COLUMN public.profiles.attendance_schedule IS 'Current off-day plan; historical changes live in employee_schedule_history.';
