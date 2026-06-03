alter table public.attendance enable row level security;

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance
for select to authenticated
using (
  employee_id = auth.uid()
  or public.is_admin_manager()
  or public.is_supervisor_for(employee_id)
);

grant select, insert, update on table public.attendance to authenticated;

notify pgrst, 'reload schema';
