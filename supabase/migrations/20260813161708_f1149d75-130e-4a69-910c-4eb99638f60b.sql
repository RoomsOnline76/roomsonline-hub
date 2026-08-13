ALTER TYPE public.refund_status ADD VALUE IF NOT EXISTS 'awaiting_guest_choice';

ALTER TABLE public.rolos_refunds
  ADD COLUMN IF NOT EXISTS guest_choice TEXT,
  ADD COLUMN IF NOT EXISTS guest_choice_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS credit_held NUMERIC NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_rolos_refunds_guest_choice
  ON public.rolos_refunds (status) WHERE guest_choice IS NOT NULL;