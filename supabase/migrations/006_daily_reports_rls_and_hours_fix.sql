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
