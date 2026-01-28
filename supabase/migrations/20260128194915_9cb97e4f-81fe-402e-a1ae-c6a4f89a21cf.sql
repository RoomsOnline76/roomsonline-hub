-- Drop existing policies if they exist and recreate with correct scoping
DROP POLICY IF EXISTS "Users can view own itinerary bookings" ON public.itinerary_bookings;
DROP POLICY IF EXISTS "Users can create itinerary bookings" ON public.itinerary_bookings;
DROP POLICY IF EXISTS "Users can update own itinerary bookings" ON public.itinerary_bookings;
DROP POLICY IF EXISTS "Users can delete own itinerary bookings" ON public.itinerary_bookings;

-- SELECT: Allow users to view their own itinerary bookings
CREATE POLICY "Users can view own itinerary bookings"
  ON public.itinerary_bookings FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_bookings.itinerary_id
      AND (i.user_id = auth.uid() OR i.session_id IS NOT NULL)
    )
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'dev')
  );

-- INSERT: Allow for their own itineraries
CREATE POLICY "Users can create itinerary bookings"
  ON public.itinerary_bookings FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_id
      AND (i.user_id = auth.uid() OR i.session_id IS NOT NULL)
    )
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'dev')
  );

-- UPDATE: Only for own itineraries or admin
CREATE POLICY "Users can update own itinerary bookings"
  ON public.itinerary_bookings FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_bookings.itinerary_id
      AND (i.user_id = auth.uid() OR i.session_id IS NOT NULL)
    )
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'dev')
  );

-- DELETE: Only for own itineraries or admin
CREATE POLICY "Users can delete own itinerary bookings"
  ON public.itinerary_bookings FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM itineraries i
      WHERE i.id = itinerary_bookings.itinerary_id
      AND (i.user_id = auth.uid() OR i.session_id IS NOT NULL)
    )
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'dev')
  );