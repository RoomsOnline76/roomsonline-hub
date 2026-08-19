ALTER TABLE public.rolos_booking_rooms
  ADD COLUMN IF NOT EXISTS guest_comments text;

COMMENT ON COLUMN public.rolos_booking_rooms.guest_comments IS
  'Guest request/comment that belongs to this unit only (channel reservations send one per StayInfo).';