DROP POLICY IF EXISTS rolos_guest_profiles_select ON public.rolos_guest_profiles;
CREATE POLICY rolos_guest_profiles_select ON public.rolos_guest_profiles
FOR SELECT TO authenticated
USING (
  is_property_owner(property_id, auth.uid())
  OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

DROP POLICY IF EXISTS rolos_booking_rooms_select ON public.rolos_booking_rooms;
CREATE POLICY rolos_booking_rooms_select ON public.rolos_booking_rooms
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.bookings b
  WHERE b.id = rolos_booking_rooms.booking_id
    AND (
      is_property_owner(b.property_id, auth.uid())
      OR is_linked_owner(b.property_id, auth.uid())
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'fearless_leader'::app_role)
    )
));