
-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "System can manage itinerary bookings" ON public.itinerary_bookings;

-- Recreate for service_role only
CREATE POLICY "Service role can manage itinerary bookings"
  ON public.itinerary_bookings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
