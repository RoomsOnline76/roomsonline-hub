-- Allow property owners to update their own hostfully room types
CREATE POLICY "Owners can update room types for their properties"
ON public.hostfully_room_types
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id = hostfully_room_types.property_id
      AND pr.id = auth.uid()
  )
  OR is_linked_owner(property_id, auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id = hostfully_room_types.property_id
      AND pr.id = auth.uid()
  )
  OR is_linked_owner(property_id, auth.uid())
);