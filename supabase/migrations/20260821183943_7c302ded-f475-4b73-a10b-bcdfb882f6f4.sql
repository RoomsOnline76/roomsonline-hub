REVOKE ALL ON FUNCTION public.manages_any_property(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manages_any_property(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.manages_any_property(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manages_any_property(uuid) TO service_role;