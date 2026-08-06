ALTER TABLE public.rolos_invoices
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'tax_invoice',
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_to text,
  ADD COLUMN IF NOT EXISTS reference text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rolos_invoices_document_kind_check'
  ) THEN
    ALTER TABLE public.rolos_invoices
      ADD CONSTRAINT rolos_invoices_document_kind_check
      CHECK (document_kind IN ('pro_forma', 'tax_invoice'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS rolos_invoices_booking_document_kind_uniq
  ON public.rolos_invoices (booking_id, document_kind)
  WHERE booking_id IS NOT NULL AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS rolos_invoices_booking_id_idx
  ON public.rolos_invoices (booking_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_invoices TO authenticated;
GRANT ALL ON public.rolos_invoices TO service_role;