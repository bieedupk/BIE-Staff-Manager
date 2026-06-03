alter table public.daily_reports
  add column if not exists review_rating integer,
  add column if not exists review_status text default 'pending_review',
  add column if not exists review_comment text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.daily_reports
  alter column review_status set default 'pending_review';

update public.daily_reports
set review_status = case
  when reviewed_at is not null then 'reviewed'
  else 'pending_review'
end
where review_status is null;

alter table public.daily_reports
  alter column review_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_reports_review_rating_range'
      and conrelid = 'public.daily_reports'::regclass
  ) then
    alter table public.daily_reports
      add constraint daily_reports_review_rating_range
      check (review_rating is null or review_rating between 1 and 5);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_reports_review_status_allowed'
      and conrelid = 'public.daily_reports'::regclass
  ) then
    alter table public.daily_reports
      add constraint daily_reports_review_status_allowed
      check (review_status in ('pending_review', 'reviewed'));
  end if;
end $$;

notify pgrst, 'reload schema';
