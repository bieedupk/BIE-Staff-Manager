-- Preserve the original employment and attendance dates. Add the 15-day
-- rotation choice to both the current plan and its dated history.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_attendance_schedule_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_attendance_schedule_check
  CHECK (attendance_schedule IN ('unspecified', 'weekly_friday', 'fortnight_two', 'monthly_four', 'bimonthly_eight'));

ALTER TABLE public.employee_schedule_history
  DROP CONSTRAINT IF EXISTS employee_schedule_history_attendance_schedule_check;
ALTER TABLE public.employee_schedule_history
  ADD CONSTRAINT employee_schedule_history_attendance_schedule_check
  CHECK (attendance_schedule IN ('unspecified', 'weekly_friday', 'fortnight_two', 'monthly_four', 'bimonthly_eight'));
