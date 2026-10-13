-- An initial off-day plan begins when attendance starts. Moving that start
-- date must move the initial plan as well, while retaining later plan changes.
CREATE FUNCTION public.reanchor_initial_employee_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_start date;
BEGIN
  IF NEW.system_entry_date IS NOT DISTINCT FROM OLD.system_entry_date THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.employee_schedule_history
  WHERE employee_id = NEW.id AND effective_from = OLD.system_entry_date
  FOR UPDATE;

  -- A start-date edit may follow an earlier manual repair of the history.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT min(effective_from) INTO v_next_start
  FROM public.employee_schedule_history
  WHERE employee_id = NEW.id AND effective_from > OLD.system_entry_date;

  IF v_next_start IS NOT NULL AND NEW.system_entry_date >= v_next_start THEN
    RAISE EXCEPTION 'Attendance start cannot pass a later off-day plan change';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employee_schedule_history
    WHERE employee_id = NEW.id AND effective_from = NEW.system_entry_date
  ) THEN
    RAISE EXCEPTION 'An off-day plan already exists on the requested attendance start date';
  END IF;

  UPDATE public.employee_schedule_history
  SET effective_from = NEW.system_entry_date
  WHERE employee_id = NEW.id AND effective_from = OLD.system_entry_date;

  IF NEW.schedule_effective_from = OLD.system_entry_date THEN
    UPDATE public.profiles
    SET schedule_effective_from = NEW.system_entry_date
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reanchor_initial_employee_schedule() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER reanchor_initial_employee_schedule_after_update
AFTER UPDATE OF system_entry_date ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.reanchor_initial_employee_schedule();
