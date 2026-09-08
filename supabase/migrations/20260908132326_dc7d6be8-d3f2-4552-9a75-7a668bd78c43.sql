ALTER TABLE public.property_charges
  ADD COLUMN IF NOT EXISTS channel_fee_type smallint;

COMMENT ON COLUMN public.property_charges.channel_fee_type IS 'Rentals United FeeTaxType code published for this charge. NULL = derive from the charge name. 0 = unknown/other.';