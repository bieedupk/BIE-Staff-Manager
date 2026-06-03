create extension if not exists pgcrypto;

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
  review_rating integer,
  review_status text not null default 'pending_review',
  review_comment text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, report_date)
);

alter table public.daily_reports
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists employee_id uuid references public.profiles(id) on delete cascade,
  add column if not exists report_date date,
  add column if not exists work_summary text,
  add column if not exists tasks_completed text,
  add column if not exists pending_work text,
  add column if not exists challenges text,
  add column if not exists hours_worked numeric(5, 2) default 0,
  add column if not exists tomorrow_plan text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_rating integer,
  add column if not exists review_status text default 'pending_review',
  add column if not exists review_comment text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.daily_reports
  alter column id set default gen_random_uuid(),
  alter column hours_worked set default 0,
  alter column review_status set default 'pending_review',
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.daily_reports
set review_status = case
  when reviewed_at is not null then 'reviewed'
  else 'pending_review'
end
where review_status is null;

alter table public.daily_reports
  alter column id set not null,
  alter column employee_id set not null,
  alter column report_date set not null,
  alter column work_summary set not null,
  alter column tasks_completed set not null,
  alter column pending_work set not null,
  alter column hours_worked set not null,
  alter column review_status set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_reports'::regclass
      and contype = 'p'
  ) then
    alter table public.daily_reports
      add constraint daily_reports_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_reports_review_rating_range'
      and conrelid = 'public.daily_reports'::regclass
  ) then
    alter table public.daily_reports
      add constraint daily_reports_review_rating_range
      check (review_rating is null or review_rating between 1 and 5);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_reports_review_status_allowed'
      and conrelid = 'public.daily_reports'::regclass
  ) then
    alter table public.daily_reports
      add constraint daily_reports_review_status_allowed
      check (review_status in ('pending_review', 'reviewed'));
  end if;
end $$;

create unique index if not exists daily_reports_employee_id_report_date_key
  on public.daily_reports (employee_id, report_date);

create index if not exists daily_reports_report_date_idx
  on public.daily_reports (report_date);

drop trigger if exists daily_reports_touch_updated_at on public.daily_reports;
create trigger daily_reports_touch_updated_at
before update on public.daily_reports
for each row execute function public.touch_updated_at();

alter table public.daily_reports enable row level security;

create or replace function public.daily_report_hours_match_attendance(
  report_employee uuid,
  report_day date,
  report_hours numeric
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.attendance a
    where report_employee = auth.uid()
      and a.employee_id = report_employee
      and a.work_date = report_day
      and a.check_out_at is not null
      and a.total_hours is not null
      and a.total_hours = report_hours
  )
$$;

drop policy if exists daily_reports_read on public.daily_reports;
drop policy if exists daily_reports_insert_own on public.daily_reports;
drop policy if exists daily_reports_review on public.daily_reports;
drop policy if exists daily_reports_update_own_unreviewed on public.daily_reports;
drop policy if exists employee_select_own_daily_reports on public.daily_reports;
drop policy if exists employee_insert_own_daily_reports on public.daily_reports;
drop policy if exists admin_select_all_daily_reports on public.daily_reports;
drop policy if exists supervisor_select_assigned_daily_reports on public.daily_reports;
drop policy if exists admin_review_daily_reports on public.daily_reports;

create policy employee_select_own_daily_reports on public.daily_reports
for select to authenticated
using (
  employee_id = auth.uid()
  and public.current_user_role() = 'employee'
);

create policy employee_insert_own_daily_reports on public.daily_reports
for insert to authenticated
with check (
  employee_id = auth.uid()
  and public.current_user_role() = 'employee'
  and public.daily_report_hours_match_attendance(employee_id, report_date, hours_worked)
);

create policy admin_select_all_daily_reports on public.daily_reports
for select to authenticated
using (public.is_admin_manager());

create policy supervisor_select_assigned_daily_reports on public.daily_reports
for select to authenticated
using (public.is_supervisor_for(employee_id));

create policy admin_review_daily_reports on public.daily_reports
for update to authenticated
using (
  public.is_admin_manager()
  or public.is_supervisor_for(employee_id)
)
with check (
  public.is_admin_manager()
  or public.is_supervisor_for(employee_id)
);

revoke all on function public.daily_report_hours_match_attendance(uuid, date, numeric) from public;
grant execute on function public.daily_report_hours_match_attendance(uuid, date, numeric) to authenticated;
grant select, insert, update on table public.daily_reports to authenticated;

notify pgrst, 'reload schema';
