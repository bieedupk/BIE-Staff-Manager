ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_read ON public.audit_logs;
CREATE POLICY audit_logs_read ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.is_admin_manager()
);

DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  OR public.is_admin_manager()
);

NOTIFY pgrst, 'reload schema';
