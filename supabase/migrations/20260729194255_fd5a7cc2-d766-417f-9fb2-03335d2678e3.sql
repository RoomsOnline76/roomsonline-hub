ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS merchant_id text,
  ADD COLUMN IF NOT EXISTS credential_source text;