create or replace function public.prevent_daily_report_review_tampering()
returns trigger
language plpgsql
as $$
begin
  if (
    old.review_status = 'reviewed'
    or old.reviewed_at is not null
    or old.review_rating is not null
  ) and (
    new.review_rating is distinct from old.review_rating
    or new.review_comment is distinct from old.review_comment
    or new.review_status is distinct from old.review_status
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
  ) then
    raise exception 'Daily report review is locked and cannot be changed.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_daily_report_review_tampering on public.daily_reports;

create trigger prevent_daily_report_review_tampering
before update on public.daily_reports
for each row
execute function public.prevent_daily_report_review_tampering();
