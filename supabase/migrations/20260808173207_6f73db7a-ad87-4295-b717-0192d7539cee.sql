ALTER TABLE public.sales_reps
  ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS trading_name text,
  ADD COLUMN IF NOT EXISTS tax_reference_number text,
  ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS tax_status_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_sales_rep_tax()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.entity_type NOT IN ('individual', 'company') THEN
    RAISE EXCEPTION 'entity_type must be individual or company';
  END IF;
  IF NEW.vat_registered AND coalesce(btrim(NEW.vat_number), '') = '' THEN
    RAISE EXCEPTION 'A VAT number is required for VAT-registered referral partners';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_sales_rep_tax ON public.sales_reps;
CREATE TRIGGER trg_validate_sales_rep_tax
  BEFORE INSERT OR UPDATE ON public.sales_reps
  FOR EACH ROW EXECUTE FUNCTION public.validate_sales_rep_tax();

ALTER TABLE public.rep_commission_reports
  ADD COLUMN IF NOT EXISTS tax_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0;