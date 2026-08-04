ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS hold_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_created_at timestamptz;

CREATE INDEX IF NOT EXISTS bookings_hold_expires_at_idx
  ON public.bookings (hold_expires_at)
  WHERE hold_expires_at IS NOT NULL;