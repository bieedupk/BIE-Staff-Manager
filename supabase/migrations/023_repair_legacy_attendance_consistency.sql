-- Repair known legacy attendance rows that contain worked timestamps
-- but were incorrectly stored as final Absent.

UPDATE public.attendance
SET
  status = CASE id
    WHEN 'b36a8d6a-956f-407d-ae09-7ac269f3fc52'::uuid THEN 'Present'::public.attendance_status
    WHEN '23f55040-f1d9-4916-b55b-3d95faff1b51'::uuid THEN 'Present'::public.attendance_status
    WHEN 'aa5bd680-d24c-4f9c-8a17-3f56ebf611a1'::uuid THEN 'Late'::public.attendance_status
    WHEN '30b550d3-f092-4ea7-ab00-d98d41bba1d3'::uuid THEN 'Present'::public.attendance_status
    WHEN '3fd76643-e8a7-4cb0-934f-89b92adfc122'::uuid THEN 'Present'::public.attendance_status
    WHEN 'beb3f123-d826-4980-a469-07fc99e3a69f'::uuid THEN 'Present'::public.attendance_status
    ELSE status
  END,
  updated_at = now()
WHERE id IN (
  'b36a8d6a-956f-407d-ae09-7ac269f3fc52'::uuid,
  '23f55040-f1d9-4916-b55b-3d95faff1b51'::uuid,
  'aa5bd680-d24c-4f9c-8a17-3f56ebf611a1'::uuid,
  '30b550d3-f092-4ea7-ab00-d98d41bba1d3'::uuid,
  '3fd76643-e8a7-4cb0-934f-89b92adfc122'::uuid,
  'beb3f123-d826-4980-a469-07fc99e3a69f'::uuid
)
AND status = 'Absent'::public.attendance_status
AND check_in_at IS NOT NULL
AND check_out_at IS NOT NULL
AND COALESCE(total_hours, 0) > 0;

-- Restore the Sep 2 midnight checkout lost by the historical 00:00
-- normalization bug. The timestamp is recovered from the audit trail.
UPDATE public.attendance
SET
  check_out_at = '2026-09-02 19:00:00+00'::timestamptz,
  total_hours = 15.00,
  status = 'Present'::public.attendance_status,
  updated_at = now()
WHERE id = 'd1950f6f-5bc2-4d4c-87cb-2ec1b8a228d2'::uuid
  AND work_date = DATE '2026-09-02'
  AND status = 'Present'::public.attendance_status
  AND check_in_at = '2026-09-02 04:00:00+00'::timestamptz
  AND check_out_at IS NULL
  AND total_hours = 15.00
  AND correction_count = 2;

NOTIFY pgrst, 'reload schema';
