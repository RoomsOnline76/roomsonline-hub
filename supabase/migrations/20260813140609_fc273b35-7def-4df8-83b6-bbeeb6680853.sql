ALTER TABLE public.ru_notifications
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS ru_notifications_retry_idx
  ON public.ru_notifications (next_attempt_at)
  WHERE resolution_state IN ('retrying', 'failed');

ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.rolos_booking_rooms REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rolos_booking_rooms;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;