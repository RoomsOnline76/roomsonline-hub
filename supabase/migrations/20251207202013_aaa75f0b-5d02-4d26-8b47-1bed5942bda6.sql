-- Update the bookings INSERT policy to allow anonymous/public bookings
-- Drop the existing restrictive policies
DROP POLICY IF EXISTS "Users can create own bookings" ON bookings;
DROP POLICY IF EXISTS "Anyone can create bookings" ON bookings;

-- Create a new policy that allows anyone (including anonymous) to create bookings
CREATE POLICY "Anyone can create bookings" 
ON bookings 
FOR INSERT 
WITH CHECK (true);