update public.departments
set name = 'Information Technology (IT)'
where name = 'IT'
  and not exists (
    select 1 from public.departments existing
    where existing.name = 'Information Technology (IT)'
  );

insert into public.departments (name, is_active)
values
  ('Finance', true),
  ('Administration', true),
  ('Admissions & Registration', true),
  ('Mail & Dispatch', true),
  ('Examinations', true),
  ('Paper Setting', true),
  ('Curriculum', true),
  ('Research', true),
  ('Information Technology (IT)', true),
  ('Teaching', true),
  ('Other', true)
on conflict (name) do update set is_active = true;

create table if not exists public.employee_departments (
  employee_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  other_department text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (employee_id, department_id)
);

insert into public.employee_departments (employee_id, department_id, other_department, is_primary)
select
  p.id,
  selected_department.id,
  case
    when selected_department.name = 'Other'
      and nullif(trim(coalesce(p.department, '')), '') is not null
      and p.department <> 'Other'
    then trim(p.department)
    else null
  end,
  true
from public.profiles p
cross join lateral (
  select d.id, d.name
  from public.departments d
  where d.id = p.department_id
    or d.name = p.department
    or (p.department = 'IT' and d.name = 'Information Technology (IT)')
    or (d.name = 'Other' and nullif(trim(coalesce(p.department, '')), '') is not null)
  order by
    case
      when d.id = p.department_id then 0
      when d.name = p.department then 1
      when p.department = 'IT' and d.name = 'Information Technology (IT)' then 2
      else 3
    end,
    d.created_at
  limit 1
) selected_department
on conflict (employee_id, department_id) do nothing;

alter table public.employee_departments enable row level security;

drop policy if exists employee_departments_read on public.employee_departments;
create policy employee_departments_read on public.employee_departments
for select to authenticated
using (
  employee_id = auth.uid()
  or public.is_admin_manager()
  or public.is_supervisor_for(employee_id)
);

drop policy if exists employee_departments_manage on public.employee_departments;
create policy employee_departments_manage on public.employee_departments
for all to authenticated
using (public.is_admin_manager())
with check (public.is_admin_manager());

grant select, insert, update, delete on table public.employee_departments to authenticated;
