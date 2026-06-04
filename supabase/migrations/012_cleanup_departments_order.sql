alter table public.departments
add column if not exists sort_order integer;

insert into public.departments (name, is_active, sort_order)
values
  ('Finance', true, 1),
  ('Administration', true, 2),
  ('Examinations', true, 3),
  ('Admissions & Registration', true, 4),
  ('Information Technology (IT)', true, 5),
  ('Mail & Dispatch', true, 6),
  ('Paper Setting', true, 7),
  ('Syllabus', true, 8),
  ('Research', true, 9),
  ('Teaching', true, 10),
  ('Other', true, 11)
on conflict (name) do update
set
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

do $$
declare
  final_names text[] := array[
    'Finance',
    'Administration',
    'Examinations',
    'Admissions & Registration',
    'Information Technology (IT)',
    'Mail & Dispatch',
    'Paper Setting',
    'Syllabus',
    'Research',
    'Teaching',
    'Other'
  ];
  duplicate_names text[] := array[
    'Admission',
    'Admissions',
    'Examination',
    'Dispatch',
    'IT',
    'Information Technology',
    'Curriculum'
  ];
begin
  create temporary table department_merge_map (
    old_id uuid primary key,
    canonical_id uuid not null,
    canonical_name text not null
  ) on commit drop;

  insert into department_merge_map (old_id, canonical_id, canonical_name)
  select old_department.id, canonical_department.id, canonical_department.name
  from public.departments old_department
  join public.departments canonical_department
    on canonical_department.name = case old_department.name
      when 'Admission' then 'Admissions & Registration'
      when 'Admissions' then 'Admissions & Registration'
      when 'Examination' then 'Examinations'
      when 'Dispatch' then 'Mail & Dispatch'
      when 'IT' then 'Information Technology (IT)'
      when 'Information Technology' then 'Information Technology (IT)'
      when 'Curriculum' then 'Syllabus'
    end
  where old_department.name = any(duplicate_names)
    and old_department.id <> canonical_department.id;

  insert into public.employee_departments (
    employee_id,
    department_id,
    other_department,
    is_primary,
    created_at
  )
  select
    employee_departments.employee_id,
    department_merge_map.canonical_id,
    employee_departments.other_department,
    employee_departments.is_primary,
    employee_departments.created_at
  from public.employee_departments
  join department_merge_map on department_merge_map.old_id = employee_departments.department_id
  on conflict (employee_id, department_id) do nothing;

  delete from public.employee_departments
  using department_merge_map
  where employee_departments.department_id = department_merge_map.old_id;

  update public.profiles
  set
    department_id = department_merge_map.canonical_id,
    department = department_merge_map.canonical_name
  from department_merge_map
  where profiles.department_id = department_merge_map.old_id;

  update public.profiles
  set department = case department
    when 'Admission' then 'Admissions & Registration'
    when 'Admissions' then 'Admissions & Registration'
    when 'Examination' then 'Examinations'
    when 'Dispatch' then 'Mail & Dispatch'
    when 'IT' then 'Information Technology (IT)'
    when 'Information Technology' then 'Information Technology (IT)'
    when 'Curriculum' then 'Syllabus'
    else department
  end
  where department in (
    'Admission',
    'Admissions',
    'Examination',
    'Dispatch',
    'IT',
    'Information Technology',
    'Curriculum'
  );

  update public.departments
  set is_active = false,
      sort_order = null
  where name <> all(final_names);
end $$;
