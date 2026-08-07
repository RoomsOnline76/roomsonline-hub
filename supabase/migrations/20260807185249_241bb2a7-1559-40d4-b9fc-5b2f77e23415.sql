ALTER TABLE public.rolos_invoices
  ADD COLUMN IF NOT EXISTS bill_to_type text NOT NULL DEFAULT 'guest',
  ADD COLUMN IF NOT EXISTS bill_to_account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bill_to_name text,
  ADD COLUMN IF NOT EXISTS bill_to_vat text,
  ADD COLUMN IF NOT EXISTS bill_to_address text,
  ADD COLUMN IF NOT EXISTS bill_to_terms_days integer,
  ADD COLUMN IF NOT EXISTS channel_key text,
  ADD COLUMN IF NOT EXISTS commission_rate numeric,
  ADD COLUMN IF NOT EXISTS commission_amount numeric,
  ADD COLUMN IF NOT EXISTS net_payable numeric;

ALTER TABLE public.rolos_invoices
  DROP CONSTRAINT IF EXISTS rolos_invoices_bill_to_type_check;

ALTER TABLE public.rolos_invoices
  ADD CONSTRAINT rolos_invoices_bill_to_type_check
  CHECK (bill_to_type IN ('guest','company','agent','channel'));

UPDATE public.rolos_invoices
SET bill_to_type = 'guest',
    bill_to_name = COALESCE(bill_to_name, invoice_to)
WHERE bill_to_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_rolos_invoices_bill_to_account
  ON public.rolos_invoices (bill_to_account_id) WHERE bill_to_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rolos_invoices_channel_key
  ON public.rolos_invoices (channel_key) WHERE channel_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rolos_invoices_property_issued
  ON public.rolos_invoices (property_id, issued_date DESC);