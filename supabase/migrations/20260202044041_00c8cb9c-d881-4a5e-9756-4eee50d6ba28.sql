-- Fix: Explicitly allow anon and authenticated roles to insert bookings
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;

CREATE POLICY "Anyone can create bookings" 
  ON public.bookings 
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);