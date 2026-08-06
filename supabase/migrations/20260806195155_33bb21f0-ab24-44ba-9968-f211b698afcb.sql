ALTER TABLE public.property_charges
  ADD COLUMN IF NOT EXISTS revenue_stream text NOT NULL DEFAULT 'accommodation',
  ADD COLUMN IF NOT EXISTS is_included_in_rate boolean NOT NULL DEFAULT false;

ALTER TABLE public.rolos_booking_charges
  ADD COLUMN IF NOT EXISTS revenue_stream text NOT NULL DEFAULT 'accommodation';

ALTER TABLE public.rolos_folio_transactions
  ADD COLUMN IF NOT EXISTS revenue_stream text NOT NULL DEFAULT 'accommodation';

ALTER TABLE public.rolos_rate_plans
  ADD COLUMN IF NOT EXISTS breakfast_included boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS breakfast_amount numeric,
  ADD COLUMN IF NOT EXISTS breakfast_basis text,
  ADD COLUMN IF NOT EXISTS breakfast_charge_id uuid REFERENCES public.property_charges(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_charges_revenue_stream_check') THEN
    ALTER TABLE public.property_charges ADD CONSTRAINT property_charges_revenue_stream_check CHECK (revenue_stream IN ('accommodation','fnb','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_booking_charges_revenue_stream_check') THEN
    ALTER TABLE public.rolos_booking_charges ADD CONSTRAINT rolos_booking_charges_revenue_stream_check CHECK (revenue_stream IN ('accommodation','fnb','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_folio_transactions_revenue_stream_check') THEN
    ALTER TABLE public.rolos_folio_transactions ADD CONSTRAINT rolos_folio_transactions_revenue_stream_check CHECK (revenue_stream IN ('accommodation','fnb','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_rate_plans_breakfast_basis_check') THEN
    ALTER TABLE public.rolos_rate_plans ADD CONSTRAINT rolos_rate_plans_breakfast_basis_check CHECK (breakfast_basis IS NULL OR breakfast_basis IN ('per_person_per_night','per_stay'));
  END IF;
END $$;

UPDATE public.property_charges SET revenue_stream = 'accommodation' WHERE revenue_stream IS NULL;
UPDATE public.rolos_booking_charges SET revenue_stream = 'accommodation' WHERE revenue_stream IS NULL;
UPDATE public.rolos_folio_transactions SET revenue_stream = 'accommodation' WHERE revenue_stream IS NULL;

CREATE INDEX IF NOT EXISTS idx_rolos_booking_charges_stream ON public.rolos_booking_charges (property_id, revenue_stream);