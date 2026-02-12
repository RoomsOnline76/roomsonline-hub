
-- Allow admins, devs, and fearless_leader to update bookings
CREATE POLICY "Admins and devs can update all bookings"
ON public.bookings FOR UPDATE
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

-- Allow property owners to update bookings for their properties
CREATE POLICY "Owners can update bookings for their properties"
ON public.bookings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id = bookings.property_id AND pr.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id = bookings.property_id AND pr.id = auth.uid()
  )
);
