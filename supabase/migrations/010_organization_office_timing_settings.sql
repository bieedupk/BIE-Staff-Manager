create table if not exists public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  short_name text not null,
  timezone text not null default 'Asia/Karachi',
  office_start_time time not null default time '09:00',
  office_end_time time not null default time '17:00',
  late_threshold_time time not null default time '09:30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organization_settings (
  id,
  organization_name,
  short_name,
  timezone,
  office_start_time,
  office_end_time,
  late_threshold_time
)
values (
  '00000000-0000-0000-0000-000000000001',
  'Board of Islamic Education',
  'BIE',
  'Asia/Karachi',
  time '09:00',
  time '17:00',
  time '09:30'
)
on conflict (id) do nothing;

drop trigger if exists organization_settings_touch_updated_at on public.organization_settings;
create trigger organization_settings_touch_updated_at
before update on public.organization_settings
for each row execute function public.touch_updated_at();

alter table public.organization_settings enable row level security;

drop policy if exists organization_settings_admin_read on public.organization_settings;
drop policy if exists organization_settings_admin_insert on public.organization_settings;
drop policy if exists organization_settings_admin_update on public.organization_settings;

create policy organization_settings_admin_read on public.organization_settings
for select to authenticated
using (public.is_admin_like());

create policy organization_settings_admin_insert on public.organization_settings
for insert to authenticated
with check (public.is_admin_manager());

create policy organization_settings_admin_update on public.organization_settings
for update to authenticated
using (public.is_admin_manager())
with check (public.is_admin_manager());

grant select, insert, update on table public.organization_settings to authenticated;
