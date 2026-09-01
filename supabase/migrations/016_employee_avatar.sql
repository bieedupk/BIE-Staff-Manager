-- Phase 1: Employee Avatar Storage & Profile Field

-- 1. Add avatar_path column to profiles
alter table public.profiles
  add column if not exists avatar_path text;

-- 2. Create private employee-avatars storage bucket if storage schema exists
insert into storage.buckets (id, name, public)
values ('employee-avatars', 'employee-avatars', false)
on conflict (id) do nothing;

-- 3. Notify postgrest to reload schema cache
notify pgrst, 'reload schema';
