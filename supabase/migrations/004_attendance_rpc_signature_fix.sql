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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
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

create or replace function public.check_out_today()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_today date := (now() at time zone 'Asia/Karachi')::date;
  existing public.attendance;
  worked_hours numeric(6, 2);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into existing
  from public.attendance
  where employee_id = auth.uid()
    and work_date = local_today
  for update;

  if existing.id is null or existing.check_in_at is null then
    raise exception 'Please check in before checking out';
  end if;

  if existing.check_out_at is not null then
    raise exception 'Attendance already checked out for today';
  end if;

  worked_hours := round((extract(epoch from (now() - existing.check_in_at)) / 3600)::numeric, 2);

  update public.attendance
  set
    check_out_at = now(),
    total_hours = worked_hours,
    status = case
      when worked_hours < 4 then 'Half Day'::public.attendance_status
      else existing.status
    end
  where id = existing.id;
end;
$$;

grant execute on function public.check_in_today() to authenticated;
grant execute on function public.check_out_today() to authenticated;

notify pgrst, 'reload schema';
