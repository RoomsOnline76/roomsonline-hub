ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid_source text,
  ADD COLUMN IF NOT EXISTS balance_due numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bookings.amount_paid IS 'Money actually received for this booking (gateway settlements + channel-collected AlreadyPaid). Anchor for refund/balance maths; never overwritten by total_price changes.';
COMMENT ON COLUMN public.bookings.amount_paid_source IS 'gateway | channel | assumed_status | manual';
COMMENT ON COLUMN public.bookings.balance_due IS 'Outstanding amount owed by the guest after a modification (0 when settled).';

-- Backfill 1: settled gateway transactions
WITH settled AS (
  SELECT booking_id, SUM(amount)::numeric AS paid
  FROM public.payment_transactions
  WHERE booking_id IS NOT NULL
    AND lower(coalesce(status, '')) IN ('complete', 'completed', 'paid', 'success')
  GROUP BY booking_id
)
UPDATE public.bookings b
SET amount_paid = settled.paid,
    amount_paid_source = 'gateway'
FROM settled
WHERE settled.booking_id = b.id
  AND b.amount_paid = 0
  AND settled.paid > 0;

-- Backfill 2: channel-collected amount stashed in modification_notes
UPDATE public.bookings b
SET amount_paid = ((b.modification_notes::jsonb) ->> 'amount_already_paid')::numeric,
    amount_paid_source = 'channel'
WHERE b.amount_paid = 0
  AND b.modification_notes IS NOT NULL
  AND jsonb_typeof(b.modification_notes::jsonb) = 'object'
  AND ((b.modification_notes::jsonb) ->> 'amount_already_paid') ~ '^[0-9]+(\.[0-9]+)?$'
  AND ((b.modification_notes::jsonb) ->> 'amount_already_paid')::numeric > 0;

-- Backfill 3: bookings flagged paid with no traceable amount
UPDATE public.bookings b
SET amount_paid = coalesce(b.total_price, 0),
    amount_paid_source = 'assumed_status'
WHERE b.amount_paid = 0
  AND coalesce(b.total_price, 0) > 0
  AND lower(coalesce(b.payment_status, '')) IN ('paid', 'paid_externally');

CREATE INDEX IF NOT EXISTS idx_bookings_balance_due
  ON public.bookings (property_id, balance_due)
  WHERE balance_due > 0;

CREATE INDEX IF NOT EXISTS idx_rolos_refunds_pending
  ON public.rolos_refunds (property_id, status)
  WHERE status IN ('pending', 'approved');