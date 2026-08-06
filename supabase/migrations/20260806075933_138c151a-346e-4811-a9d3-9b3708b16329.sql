ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason_category text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_cancellation_reason_category_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_cancellation_reason_category_check
  CHECK (
    cancellation_reason_category IS NULL
    OR cancellation_reason_category IN (
      'guest_request',
      'date_change',
      'no_payment',
      'property_operator',
      'channel_cancelled',
      'no_show',
      'other'
    )
  );

CREATE INDEX IF NOT EXISTS bookings_cancellation_reason_category_idx
  ON public.bookings (cancellation_reason_category)
  WHERE cancellation_reason_category IS NOT NULL;