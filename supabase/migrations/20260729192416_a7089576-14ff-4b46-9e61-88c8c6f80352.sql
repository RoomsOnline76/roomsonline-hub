-- 1. Override flag on properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS payment_provider_override boolean NOT NULL DEFAULT false;

-- 2. Portfolio payment configs
CREATE TABLE IF NOT EXISTS public.portfolio_payment_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL UNIQUE REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  allow_custom_payment_provider boolean NOT NULL DEFAULT false,
  payment_providers text[] NOT NULL DEFAULT '{}',
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_payment_configs TO authenticated;
GRANT ALL ON public.portfolio_payment_configs TO service_role;

ALTER TABLE public.portfolio_payment_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage portfolio payment configs" ON public.portfolio_payment_configs;
CREATE POLICY "Staff manage portfolio payment configs"
ON public.portfolio_payment_configs
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_portfolio_payment_configs_updated_at ON public.portfolio_payment_configs;
CREATE TRIGGER update_portfolio_payment_configs_updated_at
BEFORE UPDATE ON public.portfolio_payment_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Fan-out function
CREATE OR REPLACE FUNCTION public.sync_portfolio_payment_config(_portfolio_id uuid, _property_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.portfolio_payment_configs%ROWTYPE;
  prop RECORD;
BEGIN
  SELECT * INTO cfg FROM public.portfolio_payment_configs WHERE portfolio_id = _portfolio_id;
  IF NOT FOUND THEN RETURN; END IF;

  FOR prop IN
    SELECT p.id
    FROM public.properties p
    JOIN public.property_portfolio_members m ON m.property_id = p.id
    WHERE m.portfolio_id = _portfolio_id
      AND COALESCE(p.payment_provider_override, false) = false
      AND (_property_id IS NULL OR p.id = _property_id)
  LOOP
    UPDATE public.properties
       SET allow_custom_payment_provider = cfg.allow_custom_payment_provider,
           payment_providers = cfg.payment_providers,
           payment_provider = COALESCE(cfg.payment_providers[1], payment_provider)
     WHERE id = prop.id;

    IF cfg.allow_custom_payment_provider AND cfg.credentials <> '{}'::jsonb THEN
      IF EXISTS (
        SELECT 1 FROM public.integration_configs
        WHERE property_id = prop.id AND integration_type = 'payment_credentials'
      ) THEN
        UPDATE public.integration_configs
           SET config = cfg.credentials, is_active = true
         WHERE property_id = prop.id AND integration_type = 'payment_credentials';
      ELSE
        INSERT INTO public.integration_configs (property_id, integration_type, config, is_active)
        VALUES (prop.id, 'payment_credentials', cfg.credentials, true);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- 4. Triggers
CREATE OR REPLACE FUNCTION public.trg_portfolio_payment_config_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_portfolio_payment_config(NEW.portfolio_id, NULL);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS portfolio_payment_config_sync ON public.portfolio_payment_configs;
CREATE TRIGGER portfolio_payment_config_sync
AFTER INSERT OR UPDATE ON public.portfolio_payment_configs
FOR EACH ROW EXECUTE FUNCTION public.trg_portfolio_payment_config_sync();

CREATE OR REPLACE FUNCTION public.trg_portfolio_member_payment_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_portfolio_payment_config(NEW.portfolio_id, NEW.property_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS portfolio_member_payment_sync ON public.property_portfolio_members;
CREATE TRIGGER portfolio_member_payment_sync
AFTER INSERT ON public.property_portfolio_members
FOR EACH ROW EXECUTE FUNCTION public.trg_portfolio_member_payment_sync();