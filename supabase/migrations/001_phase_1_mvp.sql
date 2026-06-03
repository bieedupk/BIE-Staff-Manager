create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('super_admin', 'admin', 'supervisor', 'employee');
  end if;
  if not exists (select 1 from pg_type where typname = 'employee_status') then
    create type public.employee_status as enum ('active', 'disabled');
  end if;
  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type public.attendance_status as enum ('Present', 'Absent', 'Late', 'Half Day');
  end if;
  if not exists (select 1 from pg_type where typname = 'leave_status') then
    create type public.leave_status as enum ('Pending', 'Approved', 'Rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type public.task_priority as enum ('Low', 'Medium', 'High', 'Urgent');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('Pending', 'In Progress', 'Completed', 'Overdue');
  end if;
end $$;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role public.app_role not null default 'employee',
  department text not null default 'Other',
  department_id uuid references public.departments(id) on delete set null,
  designation text,
  supervisor_id uuid references public.profiles(id) on delete set null,
  joining_date date,
  status public.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  total_hours numeric(6, 2),
  status public.attendance_status not null default 'Present',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_type text not null,
  from_date date not null,
  to_date date not null,
  reason text not null,
  status public.leave_status not null default 'Pending',
  admin_comment text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_leave_dates check (to_date >= from_date)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  due_date date not null,
  priority public.task_priority not null default 'Medium',
  status public.task_status not null default 'Pending',
  department text not null default 'Other',
  progress_note text,
  completion_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  status public.task_status not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  report_date date not null,
  work_summary text not null,
  tasks_completed text not null,
  pending_work text not null,
  challenges text,
  hours_worked numeric(5, 2) not null default 0,
  tomorrow_plan text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, report_date)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

insert into public.departments (name)
values
  ('Administration'),
  ('Teaching'),
  ('Examination'),
  ('Accounts'),
  ('IT'),
  ('Admission'),
  ('Dispatch'),
  ('Other')
on conflict (name) do nothing;

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role::text from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_admin_like()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() in ('super_admin', 'admin', 'supervisor'), false)
$$;

create or replace function public.is_admin_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() in ('super_admin', 'admin'), false)
$$;

create or replace function public.is_supervisor_for(employee uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = employee
      and p.supervisor_id = auth.uid()
      and p.status = 'active'
  )
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists attendance_touch_updated_at on public.attendance;
create trigger attendance_touch_updated_at
before update on public.attendance
for each row execute function public.touch_updated_at();

drop trigger if exists leave_requests_touch_updated_at on public.leave_requests;
create trigger leave_requests_touch_updated_at
before update on public.leave_requests
for each row execute function public.touch_updated_at();

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
before update on public.tasks
for each row execute function public.touch_updated_at();

drop trigger if exists daily_reports_touch_updated_at on public.daily_reports;
create trigger daily_reports_touch_updated_at
before update on public.daily_reports
for each row execute function public.touch_updated_at();

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
  select assigned_to into task_owner from public.tasks where id = task_id;

  if task_owner is null or task_owner <> auth.uid() then
    raise exception 'Task not found or not assigned to current user';
  end if;

  update public.tasks
  set
    status = new_status,
    progress_note = nullif(progress, ''),
    completion_note = case when new_status = 'Completed' then nullif(completion, '') else completion_note end,
    completed_at = case when new_status = 'Completed' then now() else completed_at end
  where id = task_id;

  insert into public.task_updates (task_id, employee_id, status, note)
  values (task_id, auth.uid(), new_status, coalesce(nullif(progress, ''), nullif(completion, '')));
end;
$$;

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.attendance enable row level security;
alter table public.leave_requests enable row level security;
alter table public.tasks enable row level security;
alter table public.task_updates enable row level security;
alter table public.daily_reports enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated using (true);
drop policy if exists departments_manage on public.departments;
create policy departments_manage on public.departments for all to authenticated using (public.is_admin_manager()) with check (public.is_admin_manager());

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin_manager() or public.is_supervisor_for(id)
);
drop policy if exists profiles_manage on public.profiles;
create policy profiles_manage on public.profiles for all to authenticated using (public.is_admin_manager()) with check (public.is_admin_manager());

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated using (
  employee_id = auth.uid() or public.is_admin_manager() or public.is_supervisor_for(employee_id)
);
drop policy if exists attendance_insert_own on public.attendance;
create policy attendance_insert_own on public.attendance for insert to authenticated with check (employee_id = auth.uid());
drop policy if exists attendance_update_allowed on public.attendance;
create policy attendance_update_allowed on public.attendance for update to authenticated using (
  employee_id = auth.uid() or public.is_admin_manager()
) with check (
  employee_id = auth.uid() or public.is_admin_manager()
);

drop policy if exists leave_requests_read on public.leave_requests;
create policy leave_requests_read on public.leave_requests for select to authenticated using (
  employee_id = auth.uid() or public.is_admin_like() or public.is_supervisor_for(employee_id)
);
drop policy if exists leave_requests_insert_own on public.leave_requests;
create policy leave_requests_insert_own on public.leave_requests for insert to authenticated with check (employee_id = auth.uid() and status = 'Pending');
drop policy if exists leave_requests_review on public.leave_requests;
create policy leave_requests_review on public.leave_requests for update to authenticated using (public.is_admin_like()) with check (public.is_admin_like());

drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using (
  assigned_to = auth.uid() or assigned_by = auth.uid() or public.is_admin_like() or public.is_supervisor_for(assigned_to)
);
drop policy if exists tasks_insert_admin on public.tasks;
create policy tasks_insert_admin on public.tasks for insert to authenticated with check (public.is_admin_like() and assigned_by = auth.uid());
drop policy if exists tasks_update_admin on public.tasks;
create policy tasks_update_admin on public.tasks for update to authenticated using (public.is_admin_like()) with check (public.is_admin_like());

drop policy if exists task_updates_read on public.task_updates;
create policy task_updates_read on public.task_updates for select to authenticated using (
  employee_id = auth.uid()
  or public.is_admin_like()
  or exists (
    select 1 from public.tasks t where t.id = task_updates.task_id and public.is_supervisor_for(t.assigned_to)
  )
);
drop policy if exists task_updates_insert_own on public.task_updates;
create policy task_updates_insert_own on public.task_updates for insert to authenticated with check (employee_id = auth.uid() or public.is_admin_like());

drop policy if exists daily_reports_read on public.daily_reports;
create policy daily_reports_read on public.daily_reports for select to authenticated using (
  employee_id = auth.uid() or public.is_admin_like() or public.is_supervisor_for(employee_id)
);
drop policy if exists daily_reports_insert_own on public.daily_reports;
create policy daily_reports_insert_own on public.daily_reports for insert to authenticated with check (employee_id = auth.uid());
drop policy if exists daily_reports_review on public.daily_reports;
create policy daily_reports_review on public.daily_reports for update to authenticated using (public.is_admin_like()) with check (public.is_admin_like());

drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read on public.audit_logs for select to authenticated using (public.is_admin_manager());
drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (actor_id = auth.uid() or public.is_admin_manager());

grant execute on function public.update_my_task_status(uuid, public.task_status, text, text) to authenticated;
