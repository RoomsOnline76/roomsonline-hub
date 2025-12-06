-- Grant SELECT permission on public_properties view to anon and authenticated roles
GRANT SELECT ON public.public_properties TO anon;
GRANT SELECT ON public.public_properties TO authenticated;