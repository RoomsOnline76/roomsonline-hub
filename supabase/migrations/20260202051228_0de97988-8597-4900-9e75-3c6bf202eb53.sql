-- Drop the existing insert policy and recreate it to apply to all roles
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;

-- Create a new INSERT policy that applies to public (all roles including anon and authenticated)
CREATE POLICY "Anyone can create bookings" 
ON public.bookings 
FOR INSERT 
TO public
WITH CHECK (true);