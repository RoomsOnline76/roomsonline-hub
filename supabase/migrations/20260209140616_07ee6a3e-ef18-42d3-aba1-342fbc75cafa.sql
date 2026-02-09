
-- Fix profiles SELECT policy to include fearless_leader
DROP POLICY "Admins and devs can view all profiles" ON public.profiles;
CREATE POLICY "Admins devs and fearless can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  );

-- Fix profiles DELETE policy
DROP POLICY "Admins and devs can delete profiles" ON public.profiles;
CREATE POLICY "Admins devs and fearless can delete profiles"
  ON public.profiles FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  );

-- Fix user_roles policy to include fearless_leader
DROP POLICY "Admins and devs can manage all roles" ON public.user_roles;
CREATE POLICY "Admins devs and fearless can manage all roles"
  ON public.user_roles FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  );

-- Fix owner_pms_credentials policy to include fearless_leader
DROP POLICY "Admins and devs can manage all owner pms credentials" ON public.owner_pms_credentials;
CREATE POLICY "Admins devs and fearless can manage all pms credentials"
  ON public.owner_pms_credentials FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  );
