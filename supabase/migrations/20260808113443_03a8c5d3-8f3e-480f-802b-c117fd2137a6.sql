ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cost_eur numeric(12,2),
  ADD COLUMN IF NOT EXISTS source_currency text NOT NULL DEFAULT 'ZAR';

ALTER TABLE public.financial_metrics
  ADD COLUMN IF NOT EXISTS eur_rate numeric(12,4),
  ADD COLUMN IF NOT EXISTS monthly_burn_zar numeric(14,2),
  ADD COLUMN IF NOT EXISTS monthly_revenue_zar numeric(14,2),
  ADD COLUMN IF NOT EXISTS burn_source text NOT NULL DEFAULT 'recurring_invoices';

CREATE OR REPLACE FUNCTION public.calculate_runway()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cash_zar numeric;
  burn_zar numeric;
  rev_zar numeric;
  net_burn numeric;
  fx numeric;
BEGIN
  fx := COALESCE(NEW.exchange_rate, 18.5);

  cash_zar := COALESCE(NEW.cash_balance_zar, NEW.cash_balance_usd * fx);
  burn_zar := COALESCE(NEW.monthly_burn_zar, NEW.monthly_burn_usd * fx);
  rev_zar  := COALESCE(NEW.monthly_revenue_zar, NEW.monthly_revenue_usd * fx, 0);

  NEW.runway_months := NULL;

  IF burn_zar IS NOT NULL AND burn_zar > 0 AND cash_zar IS NOT NULL THEN
    net_burn := burn_zar - rev_zar;
    IF net_burn <= 0 THEN
      NEW.runway_months := 999;
    ELSE
      NEW.runway_months := ROUND((cash_zar / net_burn)::numeric, 1);
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;