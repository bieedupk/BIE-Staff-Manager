create or replace function public.is_supervisor_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() = 'supervisor', false)
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() = 'super_admin', false)
$$;

create or replace function public.can_manage_employee(employee uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.is_admin_manager()
    or (
      public.is_supervisor_role()
      and public.is_supervisor_for(employee)
    ),
    false
  )
$$;

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
    case when local_time > time '09:30' then 'Late'::public.attendance_status else 'Present'::public.attendance_status end
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

create or replace function public.update_my_task_status(
  task_id uuid,
  new_status public.task_status,
  progress text default null,
  completion text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  task_owner uuid;
begin
  if new_status not in ('Pending'::public.task_status, 'In Progress'::public.task_status, 'Completed'::public.task_status) then
    raise exception 'Employees can only set Pending, In Progress, or Completed';
  end if;

  select assigned_to into task_owner from public.tasks where id = task_id;

  if task_owner is null or task_owner <> auth.uid() then
    raise exception 'Task not found or not assigned to current user';
  end if;

  update public.tasks
  set
    status = new_status,
    progress_note = nullif(progress, ''),
    completion_note = case when new_status = 'Completed' then nullif(completion, '') else null end,
    completed_at = case when new_status = 'Completed' then now() else null end
  where id = task_id;

  insert into public.task_updates (task_id, employee_id, status, note)
  values (task_id, auth.uid(), new_status, coalesce(nullif(progress, ''), nullif(completion, '')));
end;
$$;

drop policy if exists attendance_insert_own on public.attendance;
drop policy if exists attendance_update_allowed on public.attendance;
drop policy if exists attendance_update_admin_manager on public.attendance;
create policy attendance_update_admin_manager on public.attendance
for update to authenticated
using (public.is_admin_manager())
with check (public.is_admin_manager());

drop policy if exists profiles_manage on public.profiles;
drop policy if exists profiles_insert_admin_manager on public.profiles;
drop policy if exists profiles_update_admin_manager on public.profiles;
drop policy if exists profiles_delete_admin_manager on public.profiles;
create policy profiles_insert_admin_manager on public.profiles
for insert to authenticated
with check (
  public.is_admin_manager()
  and (role <> 'super_admin'::public.app_role or public.is_super_admin())
);
create policy profiles_update_admin_manager on public.profiles
for update to authenticated
using (public.is_admin_manager())
with check (
  public.is_admin_manager()
  and (role <> 'super_admin'::public.app_role or public.is_super_admin())
);
create policy profiles_delete_admin_manager on public.profiles
for delete to authenticated
using (public.is_admin_manager());

drop policy if exists leave_requests_read on public.leave_requests;
create policy leave_requests_read on public.leave_requests
for select to authenticated
using (
  employee_id = auth.uid()
  or public.is_admin_manager()
  or public.is_supervisor_for(employee_id)
);

drop policy if exists leave_requests_review on public.leave_requests;
create policy leave_requests_review on public.leave_requests
for update to authenticated
using (public.is_admin_manager() or public.is_supervisor_for(employee_id))
with check (public.is_admin_manager() or public.is_supervisor_for(employee_id));

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks
for select to authenticated
using (
  assigned_to = auth.uid()
  or assigned_by = auth.uid()
  or public.is_admin_manager()
  or public.is_supervisor_for(assigned_to)
);

drop policy if exists tasks_insert_admin on public.tasks;
create policy tasks_insert_admin on public.tasks
for insert to authenticated
with check (
  assigned_by = auth.uid()
  and (
    public.is_admin_manager()
    or public.is_supervisor_for(assigned_to)
  )
);

drop policy if exists tasks_update_admin on public.tasks;
create policy tasks_update_admin on public.tasks
for update to authenticated
using (public.is_admin_manager() or public.is_supervisor_for(assigned_to))
with check (public.is_admin_manager() or public.is_supervisor_for(assigned_to));

drop policy if exists task_updates_read on public.task_updates;
create policy task_updates_read on public.task_updates
for select to authenticated
using (
  employee_id = auth.uid()
  or public.is_admin_manager()
  or exists (
    select 1
    from public.tasks t
    where t.id = task_updates.task_id
      and public.is_supervisor_for(t.assigned_to)
  )
);

drop policy if exists task_updates_insert_own on public.task_updates;
create policy task_updates_insert_own on public.task_updates
for insert to authenticated
with check (
  employee_id = auth.uid()
  or public.is_admin_manager()
  or public.is_supervisor_for(employee_id)
);

drop policy if exists daily_reports_read on public.daily_reports;
create policy daily_reports_read on public.daily_reports
for select to authenticated
using (
  employee_id = auth.uid()
  or public.is_admin_manager()
  or public.is_supervisor_for(employee_id)
);

drop policy if exists daily_reports_review on public.daily_reports;
drop policy if exists daily_reports_update_own_unreviewed on public.daily_reports;
create policy daily_reports_update_own_unreviewed on public.daily_reports
for update to authenticated
using (employee_id = auth.uid() and reviewed_at is null)
with check (employee_id = auth.uid());
create policy daily_reports_review on public.daily_reports
for update to authenticated
using (public.is_admin_manager() or public.is_supervisor_for(employee_id))
with check (public.is_admin_manager() or public.is_supervisor_for(employee_id));

grant execute on function public.check_in_today() to authenticated;
grant execute on function public.check_out_today() to authenticated;
grant execute on function public.update_my_task_status(uuid, public.task_status, text, text) to authenticated;
