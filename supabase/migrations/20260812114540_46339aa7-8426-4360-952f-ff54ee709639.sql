ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS mandate_token text,
  ADD COLUMN IF NOT EXISTS mandate_status text,
  ADD COLUMN IF NOT EXISTS mandate_amount numeric,
  ADD COLUMN IF NOT EXISTS mandate_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_requires_reauth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_auto_charge_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_auto_charge_status text,
  ADD COLUMN IF NOT EXISTS last_auto_charge_error text,
  ADD COLUMN IF NOT EXISTS auto_charge_failures integer NOT NULL DEFAULT 0;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS mandate_token text,
  ADD COLUMN IF NOT EXISTS mandate_status text,
  ADD COLUMN IF NOT EXISTS mandate_amount numeric,
  ADD COLUMN IF NOT EXISTS mandate_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS mandate_requires_reauth boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_auto_charge_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_auto_charge_status text,
  ADD COLUMN IF NOT EXISTS last_auto_charge_error text,
  ADD COLUMN IF NOT EXISTS auto_charge_failures integer NOT NULL DEFAULT 0;

ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS auto_charged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mandate_token text;