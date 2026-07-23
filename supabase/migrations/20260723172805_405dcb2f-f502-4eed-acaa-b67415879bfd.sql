
-- properties: rescope admin policies to authenticated
DROP POLICY IF EXISTS "Admins and devs can view all properties" ON public.properties;
CREATE POLICY "Admins and devs can view all properties"
  ON public.properties FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

DROP POLICY IF EXISTS "Admins and devs can update properties" ON public.properties;
CREATE POLICY "Admins and devs can update properties"
  ON public.properties FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

DROP POLICY IF EXISTS "Admins and devs can delete properties" ON public.properties;
CREATE POLICY "Admins and devs can delete properties"
  ON public.properties FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

-- hostfully_room_types: rescope admin ALL policy to authenticated
DROP POLICY IF EXISTS "Admins and devs can manage all hostfully room types" ON public.hostfully_room_types;
CREATE POLICY "Admins and devs can manage all hostfully room types"
  ON public.hostfully_room_types FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

-- local_experiences: rescope admin ALL policy to authenticated
DROP POLICY IF EXISTS "Admins can manage all experiences" ON public.local_experiences;
CREATE POLICY "Admins can manage all experiences"
  ON public.local_experiences FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));
