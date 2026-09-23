ALTER TYPE public.leave_status
ADD VALUE IF NOT EXISTS 'Cancelled';

NOTIFY pgrst, 'reload schema';
