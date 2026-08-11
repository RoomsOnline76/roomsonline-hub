ALTER TYPE public.refund_status ADD VALUE IF NOT EXISTS 'failed';

ALTER TABLE public.rolos_refunds
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_by uuid,
  ADD COLUMN IF NOT EXISTS requested_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS entitled_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS reason_category text,
  ADD COLUMN IF NOT EXISTS gateway text,
  ADD COLUMN IF NOT EXISTS gateway_error text,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS pf_payment_id text,
  ADD COLUMN IF NOT EXISTS manual_settlement boolean NOT NULL DEFAULT false;

ALTER TABLE public.rolos_refunds ALTER COLUMN payment_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_booking ON public.rolos_refunds (booking_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.rolos_refunds (status, created_at DESC);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS refund_auto_approve_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_auto_approve_cap numeric(12,2) NOT NULL DEFAULT 0;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_refunds TO authenticated;
GRANT ALL ON public.rolos_refunds TO service_role;