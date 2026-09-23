CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(public.current_user_role() = 'super_admin', false)
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_read ON public.profiles;
CREATE POLICY profiles_read ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.is_admin_manager()
  OR public.is_supervisor_for(id)
);

DROP POLICY IF EXISTS profiles_manage ON public.profiles;

DROP POLICY IF EXISTS profiles_insert_admin_manager ON public.profiles;
CREATE POLICY profiles_insert_admin_manager ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_manager()
  AND (
    role <> 'super_admin'::public.app_role
    OR public.is_super_admin()
  )
);

DROP POLICY IF EXISTS profiles_update_admin_manager ON public.profiles;
CREATE POLICY profiles_update_admin_manager ON public.profiles
FOR UPDATE TO authenticated
USING (
  public.is_admin_manager()
)
WITH CHECK (
  public.is_admin_manager()
  AND (
    role <> 'super_admin'::public.app_role
    OR public.is_super_admin()
  )
);

DROP POLICY IF EXISTS profiles_delete_admin_manager ON public.profiles;
CREATE POLICY profiles_delete_admin_manager ON public.profiles
FOR DELETE TO authenticated
USING (
  public.is_admin_manager()
);

NOTIFY pgrst, 'reload schema';
