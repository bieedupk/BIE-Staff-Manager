-- Notifications are created by database events so the original write and its
-- notification succeed or fail together. No historical events are backfilled.
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 400),
  href text NOT NULL CHECK (length(href) BETWEEN 1 AND 200),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX notifications_recipient_recent_idx
ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX notifications_recipient_unread_idx
ON public.notifications (recipient_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
CREATE POLICY notifications_read_own ON public.notifications
FOR SELECT TO authenticated USING (recipient_id = auth.uid());

CREATE FUNCTION public.mark_notifications_read(p_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.notifications
  SET read_at = now()
  WHERE recipient_id = auth.uid() AND read_at IS NULL
    AND (p_id IS NULL OR id = p_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid) TO authenticated;

-- This helper is called only by the event triggers below.
CREATE FUNCTION public.notify_staff_admins(
  p_kind text, p_actor uuid, p_title text, p_body text,
  p_href text, p_entity_type text, p_entity_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.notifications
    (recipient_id, actor_id, kind, title, body, href, entity_type, entity_id)
  SELECT p.id, p_actor, p_kind, left(p_title, 160), left(p_body, 400),
    p_href, p_entity_type, p_entity_id
  FROM public.profiles p
  WHERE p.status = 'active' AND p.role IN ('admin', 'super_admin')
    AND p.id IS DISTINCT FROM p_actor;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_staff_admins(text, uuid, text, text, text, text, uuid)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.notify_staff_leave() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'Pending' THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.employee_id;
    PERFORM public.notify_staff_admins('leave_requested', NEW.employee_id,
      'New leave request', coalesce(v_name, 'Employee') || ' requested ' || NEW.leave_type ||
      ' leave (' || NEW.from_date || ' to ' || NEW.to_date || ').',
      '/admin/leaves', 'leave_requests', NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
      AND NEW.status IN ('Approved', 'Rejected', 'Cancelled') THEN
    INSERT INTO public.notifications
      (recipient_id, actor_id, kind, title, body, href, entity_type, entity_id)
    SELECT p.id, NEW.reviewed_by, 'leave_decided', 'Leave request updated',
      'Your ' || NEW.leave_type || ' leave (' || NEW.from_date || ' to ' ||
      NEW.to_date || ') is ' || NEW.status || '.', '/employee/leave',
      'leave_requests', NEW.id
    FROM public.profiles p WHERE p.id = NEW.employee_id AND p.status = 'active';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_staff_leave() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notifications_leave_insert AFTER INSERT ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_leave();
CREATE TRIGGER notifications_leave_update AFTER UPDATE OF status ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_leave();

CREATE FUNCTION public.notify_staff_task() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications
      (recipient_id, actor_id, kind, title, body, href, entity_type, entity_id)
    SELECT p.id, NEW.assigned_by, 'task_assigned', 'New task assigned',
      left(NEW.title, 400), '/employee/tasks', 'tasks', NEW.id
    FROM public.profiles p WHERE p.id = NEW.assigned_to AND p.status = 'active';
  ELSIF TG_OP = 'UPDATE' AND
      (NEW.status IS DISTINCT FROM OLD.status OR
       NEW.progress_note IS DISTINCT FROM OLD.progress_note OR
       NEW.completion_note IS DISTINCT FROM OLD.completion_note)
      AND auth.uid() = NEW.assigned_to THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.assigned_to;
    PERFORM public.notify_staff_admins('task_updated', NEW.assigned_to,
      'Task updated', coalesce(v_name, 'Employee') || ' updated ' ||
      left(NEW.title, 180) || ' (' || NEW.status || ').',
      '/admin/tasks', 'tasks', NEW.id);
    -- The assigning supervisor also receives progress updates.
    INSERT INTO public.notifications
      (recipient_id, actor_id, kind, title, body, href, entity_type, entity_id)
    SELECT p.id, NEW.assigned_to, 'task_updated', 'Task updated',
      coalesce(v_name, 'Employee') || ' updated ' || left(NEW.title, 180) ||
      ' (' || NEW.status || ').', '/admin/tasks', 'tasks', NEW.id
    FROM public.profiles p WHERE p.id = NEW.assigned_by
      AND p.status = 'active' AND p.role = 'supervisor';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_staff_task() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notifications_task_insert AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_task();
CREATE TRIGGER notifications_task_update
AFTER UPDATE OF status, progress_note, completion_note ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_task();

CREATE FUNCTION public.notify_staff_check_in() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text;
BEGIN
  -- Employee check-ins only. Admin corrections and historical imports use a
  -- different actor and must not create misleading live check-in alerts.
  IF TG_OP = 'UPDATE' AND OLD.check_in_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.check_in_at IS NOT NULL
     AND auth.uid() = NEW.employee_id
     AND NEW.check_in_at BETWEEN now() - interval '2 minutes' AND now() + interval '2 minutes'
  THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.employee_id;
    PERFORM public.notify_staff_admins('employee_checked_in', NEW.employee_id,
      'Employee checked in', coalesce(v_name, 'Employee') ||
      ' checked in on ' || NEW.work_date || '.',
      '/admin/attendance', 'attendance', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_staff_check_in() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notifications_attendance_check_in_insert AFTER INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_check_in();
CREATE TRIGGER notifications_attendance_check_in_update AFTER UPDATE OF check_in_at ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_check_in();

CREATE FUNCTION public.notify_staff_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text;
BEGIN
  IF TG_OP = 'INSERT' AND auth.uid() = NEW.employee_id THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.employee_id;
    PERFORM public.notify_staff_admins('report_submitted', NEW.employee_id,
      'Daily report submitted', coalesce(v_name, 'Employee') ||
      ' submitted a daily report for ' || NEW.report_date || '.',
      '/admin/daily-reports', 'daily_reports', NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.review_status = 'reviewed'
      AND OLD.review_status IS DISTINCT FROM NEW.review_status THEN
    INSERT INTO public.notifications
      (recipient_id, actor_id, kind, title, body, href, entity_type, entity_id)
    SELECT p.id, NEW.reviewed_by, 'report_reviewed', 'Daily report reviewed',
      'Your report for ' || NEW.report_date || ' has been reviewed.',
      '/employee/daily-report', 'daily_reports', NEW.id
    FROM public.profiles p WHERE p.id = NEW.employee_id AND p.status = 'active';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_staff_report() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notifications_report_insert AFTER INSERT ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_report();
CREATE TRIGGER notifications_report_review AFTER UPDATE OF review_status ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_report();

CREATE FUNCTION public.notify_staff_device_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = NEW.employee_id;
    PERFORM public.notify_staff_admins('device_requested', NEW.employee_id,
      'Device approval requested', coalesce(v_name, 'Employee') ||
      ' requested device access.', '/admin/employees',
      'device_registration_requests', NEW.id);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status IN ('approved', 'rejected') THEN
    INSERT INTO public.notifications
      (recipient_id, actor_id, kind, title, body, href, entity_type, entity_id)
    SELECT p.id, NEW.reviewed_by, 'device_decided', 'Device request updated',
      'Your device request was ' || NEW.status || '.',
      '/device-access', 'device_registration_requests', NEW.id
    FROM public.profiles p WHERE p.id = NEW.employee_id AND p.status = 'active';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_staff_device_request() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notifications_device_request_insert AFTER INSERT ON public.device_registration_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_device_request();
CREATE TRIGGER notifications_device_request_review AFTER UPDATE OF status ON public.device_registration_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_device_request();
