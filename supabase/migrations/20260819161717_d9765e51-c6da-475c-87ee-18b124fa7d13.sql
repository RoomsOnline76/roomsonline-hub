ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS channel_listing_id text;

COMMENT ON COLUMN public.bookings.channel_listing_id IS
  'Channel Manager listing id the reservation was created against. Authoritative "current" listing for outbound modify/cancel pushes.';

CREATE INDEX IF NOT EXISTS idx_bookings_channel_listing
  ON public.bookings (channel_listing_id)
  WHERE channel_listing_id IS NOT NULL;