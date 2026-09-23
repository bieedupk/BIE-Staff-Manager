-- Ensure RLS is enabled
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: employee can read own, admin/manager can read all, supervisor can read employees they supervise
DROP POLICY IF EXISTS leave_requests_read ON public.leave_requests;
CREATE POLICY leave_requests_read ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin_manager()
    OR public.is_supervisor_for(employee_id)
  );

-- 2. INSERT: authenticated employee can insert only their own leave request and only with status = 'Pending'
DROP POLICY IF EXISTS leave_requests_insert_own ON public.leave_requests;
CREATE POLICY leave_requests_insert_own ON public.leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    AND status = 'Pending'::public.leave_status
  );

-- 3. UPDATE/review: admin/manager can review, supervisor can review employees they supervise
DROP POLICY IF EXISTS leave_requests_review ON public.leave_requests;
CREATE POLICY leave_requests_review ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_manager()
    OR public.is_supervisor_for(employee_id)
  )
  WITH CHECK (
    public.is_admin_manager()
    OR public.is_supervisor_for(employee_id)
  );

-- Notify PostgREST to reload the schema schema cache
NOTIFY pgrst, 'reload schema';
