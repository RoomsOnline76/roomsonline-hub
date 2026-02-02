-- Grant INSERT privilege on bookings table to anon role
-- This is required for anonymous users to create bookings (RLS policy already allows it)
GRANT INSERT ON public.bookings TO anon;

-- Also ensure authenticated role has INSERT (should already exist but being explicit)
GRANT INSERT ON public.bookings TO authenticated;