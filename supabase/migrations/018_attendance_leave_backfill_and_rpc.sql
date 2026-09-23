-- Backfill existing Approved leave requests into attendance
INSERT INTO public.attendance (employee_id, work_date, status, check_in_at, check_out_at, total_hours)
SELECT
    lr.employee_id,
    d.work_date::date,
    'Leave'::public.attendance_status,
    NULL,
    NULL,
    NULL
FROM public.leave_requests lr
JOIN LATERAL generate_series(lr.from_date::timestamp, lr.to_date::timestamp, '1 day'::interval) d(work_date) ON true
WHERE lr.status = 'Approved'
ON CONFLICT (employee_id, work_date) DO NOTHING;

-- Recreate check_in_today function with Leave validation
create or replace function public.check_in_today()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  local_today date := (now() at time zone 'Asia/Karachi')::date;
  local_time time := (now() at time zone 'Asia/Karachi')::time;
  new_id uuid;
  has_approved_leave boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from public.leave_requests
    where employee_id = auth.uid()
      and status = 'Approved'
      and local_today >= from_date
      and local_today <= to_date
  ) into has_approved_leave;

  if has_approved_leave then
    raise exception 'Approved leave exists for today';
  end if;

  insert into public.attendance (employee_id, work_date, check_in_at, status)
  values (
    auth.uid(),
    local_today,
    now(),
    case
      when local_time > time '09:30' then 'Late'::public.attendance_status
      else 'Present'::public.attendance_status
    end
  )
  returning id into new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'Attendance already exists for today';
end;
$$;
