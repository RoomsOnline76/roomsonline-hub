CREATE POLICY "Admins devs and fearless can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'dev') OR
  public.has_role(auth.uid(), 'fearless_leader')
);