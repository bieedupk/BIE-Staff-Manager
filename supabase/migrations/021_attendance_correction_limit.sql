-- Limit attendance corrections to 2
ALTER TABLE public.attendance
ADD COLUMN IF NOT EXISTS correction_count smallint NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendance_correction_count_check'
    ) THEN
        ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_correction_count_check
        CHECK (correction_count >= 0 AND correction_count <= 2);
    END IF;
END $$;

-- Backfill correction_count from existing audit logs
UPDATE public.attendance a
SET correction_count = LEAST(
    (SELECT COUNT(*)
     FROM public.audit_logs al
     WHERE al.action = 'attendance_corrected'
       AND al.entity_type = 'attendance'
       AND al.entity_id = a.id),
    2
)
WHERE a.correction_count = 0;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
