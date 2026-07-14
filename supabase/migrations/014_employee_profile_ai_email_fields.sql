alter table public.profiles
  add column if not exists employee_type text,
  add column if not exists responsibilities text;

notify pgrst, 'reload schema';
