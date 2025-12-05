-- Add missing columns to bookings table for Benson API integration
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS teens integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS room_type_id text,
ADD COLUMN IF NOT EXISTS rate_type_id text,
ADD COLUMN IF NOT EXISTS rooms jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS voucher text,
ADD COLUMN IF NOT EXISTS external_reservation_id text;

-- Add comment explaining the rooms structure
COMMENT ON COLUMN public.bookings.rooms IS 'Array of room bookings: [{roomTypeId, roomTypeName, numberOfAdults, numberOfTeens, numberOfChildren, numberOfInfants}]';

-- Update RLS policy to allow public users to create bookings (for guest checkout)
CREATE POLICY "Anyone can create bookings"
ON public.bookings
FOR INSERT
WITH CHECK (true);

-- Allow users to view bookings by email (for guest users without accounts)
CREATE POLICY "Users can view bookings by email"
ON public.bookings
FOR SELECT
USING (guest_email = current_setting('request.jwt.claims', true)::json->>'email');