ALTER TABLE public.ru_owner_accounts
  ADD COLUMN IF NOT EXISTS portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS company_filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS company_payload jsonb;

ALTER TABLE public.ru_owner_accounts DROP CONSTRAINT IF EXISTS ru_owner_accounts_owner_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS ru_owner_accounts_portfolio_uidx
  ON public.ru_owner_accounts (portfolio_id) WHERE portfolio_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ru_owner_accounts_property_uidx
  ON public.ru_owner_accounts (property_id) WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ru_owner_accounts_email_uidx
  ON public.ru_owner_accounts (owner_email) WHERE portfolio_id IS NULL AND property_id IS NULL;

CREATE TABLE IF NOT EXISTS public.ru_mcq_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  ru_property_id text NOT NULL,
  ordered_by uuid,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ordered',
  ru_status_id text,
  response_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ru_mcq_orders TO authenticated;
GRANT ALL ON public.ru_mcq_orders TO service_role;
ALTER TABLE public.ru_mcq_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ru_mcq_orders"
ON public.ru_mcq_orders FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'));

CREATE TRIGGER update_ru_mcq_orders_updated_at
BEFORE UPDATE ON public.ru_mcq_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();