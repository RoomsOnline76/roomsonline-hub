ALTER TABLE public.rolos_booking_rooms
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.rolos_booking_rooms
  DROP CONSTRAINT IF EXISTS rolos_booking_rooms_status_check;

ALTER TABLE public.rolos_booking_rooms
  ADD CONSTRAINT rolos_booking_rooms_status_check
  CHECK (status IN ('active', 'cancelled'));

CREATE INDEX IF NOT EXISTS rolos_booking_rooms_booking_status_idx
  ON public.rolos_booking_rooms (booking_id, status);