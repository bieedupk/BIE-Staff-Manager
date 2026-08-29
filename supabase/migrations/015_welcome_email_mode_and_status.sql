alter table public.profiles
  add column if not exists welcome_email_mode text not null default 'automatic' check (welcome_email_mode in ('automatic', 'manual')),
  add column if not exists welcome_email_status text not null default 'pending' check (welcome_email_status in ('pending', 'sending', 'sent', 'failed', 'skipped'));

create index if not exists profiles_welcome_email_mode_idx on public.profiles (welcome_email_mode);
create index if not exists profiles_welcome_email_status_idx on public.profiles (welcome_email_status);

notify pgrst, 'reload schema';
