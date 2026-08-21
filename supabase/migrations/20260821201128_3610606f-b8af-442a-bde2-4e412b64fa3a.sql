CREATE OR REPLACE FUNCTION public.diag_upload_check(_name text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'uid', auth.uid(),
    'jwt_role', current_setting('request.jwt.claims', true),
    'current_role', current_user,
    'is_dev', public.has_role(auth.uid(), 'dev'::app_role),
    'reports_access', public.has_reports_access(auth.uid()),
    'folder1', (storage.foldername(_name))[1]
  )
$$;
GRANT EXECUTE ON FUNCTION public.diag_upload_check(text) TO authenticated;