create table if not exists public.authorized_devices (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  device_name text not null,
  device_token_hash text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  registered_by uuid references public.profiles(id) on delete set null,
  registered_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_ip text,
  last_user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists authorized_devices_employee_id_idx on public.authorized_devices (employee_id);
create index if not exists authorized_devices_active_token_idx
  on public.authorized_devices (employee_id, device_token_hash)
  where status = 'active';

alter table public.authorized_devices enable row level security;

drop policy if exists authorized_devices_read on public.authorized_devices;
create policy authorized_devices_read on public.authorized_devices
for select to authenticated
using (
  employee_id = auth.uid()
  or public.is_admin_manager()
  or public.is_supervisor_for(employee_id)
);

drop policy if exists authorized_devices_insert_admin on public.authorized_devices;
create policy authorized_devices_insert_admin on public.authorized_devices
for insert to authenticated
with check (public.is_admin_manager());

drop policy if exists authorized_devices_update_admin on public.authorized_devices;
create policy authorized_devices_update_admin on public.authorized_devices
for update to authenticated
using (public.is_admin_manager())
with check (public.is_admin_manager());
