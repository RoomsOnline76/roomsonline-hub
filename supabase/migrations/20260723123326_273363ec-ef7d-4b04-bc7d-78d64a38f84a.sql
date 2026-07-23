
ALTER TABLE public.billing_global_defaults ADD COLUMN IF NOT EXISTS byo_gateway_monthly_fee numeric;
ALTER TABLE public.property_billing_configs ADD COLUMN IF NOT EXISTS byo_gateway_monthly_fee numeric;

-- Backfill: if existing payment_facilitator_fee looks like a ZAR amount (>20), assume it was meant as flat fee
UPDATE public.billing_global_defaults
SET byo_gateway_monthly_fee = payment_facilitator_fee
WHERE payment_facilitator_fee IS NOT NULL
  AND payment_facilitator_fee > 20
  AND byo_gateway_monthly_fee IS NULL;
