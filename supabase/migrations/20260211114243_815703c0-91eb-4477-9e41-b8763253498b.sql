-- Fix: ALL policy needs WITH CHECK for inserts/updates
DROP POLICY "Admins and devs full access to owner_contracts" ON public.owner_contracts;

CREATE POLICY "Admins and devs full access to owner_contracts"
ON public.owner_contracts
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'dev'::app_role) OR 
  has_role(auth.uid(), 'fearless_leader'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'dev'::app_role) OR 
  has_role(auth.uid(), 'fearless_leader'::app_role)
);