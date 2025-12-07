-- Grant INSERT permission to anon and authenticated roles on bookings table
GRANT INSERT ON public.bookings TO anon;
GRANT INSERT ON public.bookings TO authenticated;

-- Also grant SELECT so the .select() after insert works
GRANT SELECT ON public.bookings TO anon;
GRANT SELECT ON public.bookings TO authenticated;

-- Grant UPDATE for authenticated users
GRANT UPDATE ON public.bookings TO authenticated;