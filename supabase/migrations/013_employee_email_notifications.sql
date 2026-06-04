create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text unique not null,
  subject text not null,
  body_text text not null,
  body_html text,
  contact_email text,
  contact_phone text,
  contact_address text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  template_key text,
  subject text,
  status text not null check (status in ('sent','failed','skipped')),
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

insert into public.email_templates (
  template_key,
  subject,
  body_text,
  body_html,
  contact_email,
  contact_phone,
  contact_address,
  is_active
)
values (
  'employee_welcome',
  'Welcome to {{organization_name}}',
  'Dear {{employee_name}},

You have been appointed to this position by the {{organization_name}}. We warmly welcome you to our team and look forward to working with you.

Designation: {{designation}}
Departments: {{departments}}
Username / email: {{email}}

Password setup:
{{setup_link}}

Contact:
Email: {{contact_email}}
Phone: {{contact_phone}}
Address: {{contact_address}}',
  '<p>Dear {{employee_name}},</p>
<p>You have been appointed to this position by the <strong>{{organization_name}}</strong>. We warmly welcome you to our team and look forward to working with you.</p>
<p><strong>Designation:</strong> {{designation}}<br />
<strong>Departments:</strong> {{departments}}<br />
<strong>Username / email:</strong> {{email}}</p>
<p><strong>Password setup:</strong><br />{{setup_link}}</p>
<p><strong>Contact:</strong><br />
Email: {{contact_email}}<br />
Phone: {{contact_phone}}<br />
Address: {{contact_address}}</p>',
  '',
  '',
  '',
  true
)
on conflict (template_key) do nothing;

drop trigger if exists email_templates_touch_updated_at on public.email_templates;
create trigger email_templates_touch_updated_at
before update on public.email_templates
for each row execute function public.touch_updated_at();

alter table public.email_templates enable row level security;
alter table public.email_logs enable row level security;

drop policy if exists email_templates_admin_read on public.email_templates;
drop policy if exists email_templates_admin_manage on public.email_templates;
drop policy if exists email_logs_admin_read on public.email_logs;
drop policy if exists email_logs_admin_insert on public.email_logs;

create policy email_templates_admin_read on public.email_templates
for select to authenticated
using (public.is_admin_manager());

create policy email_templates_admin_manage on public.email_templates
for all to authenticated
using (public.is_admin_manager())
with check (public.is_admin_manager());

create policy email_logs_admin_read on public.email_logs
for select to authenticated
using (public.is_admin_manager());

create policy email_logs_admin_insert on public.email_logs
for insert to authenticated
with check (public.is_admin_manager());

grant select, insert, update on table public.email_templates to authenticated;
grant select, insert on table public.email_logs to authenticated;
