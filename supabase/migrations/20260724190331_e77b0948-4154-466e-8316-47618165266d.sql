
-- ── 1. Extend subscription_invoices ──────────────────────────────────────
ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS subscription_amount numeric(12,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS once_off_amount numeric(12,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS invoice_number text UNIQUE;

CREATE SEQUENCE IF NOT EXISTS public.subscription_invoice_number_seq START 1000;
GRANT USAGE ON SEQUENCE public.subscription_invoice_number_seq TO service_role;

-- ── 2. Subscription charge items ledger ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_charge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  owner_id uuid,
  kind text NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending',
  invoiced_on_invoice_id uuid REFERENCES public.subscription_invoices(id) ON DELETE SET NULL,
  invoiced_at timestamptz,
  waived_at timestamptz,
  waived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT charge_scope_check CHECK ((property_id IS NOT NULL)::int + (portfolio_id IS NOT NULL)::int = 1),
  CONSTRAINT charge_status_check CHECK (status IN ('pending','invoiced','waived'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_charge_items TO authenticated;
GRANT ALL ON public.subscription_charge_items TO service_role;
ALTER TABLE public.subscription_charge_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_charge_items_property_pending
  ON public.subscription_charge_items(property_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_charge_items_portfolio_pending
  ON public.subscription_charge_items(portfolio_id, status) WHERE status = 'pending';

-- Admins can see/manage all
DROP POLICY IF EXISTS charge_items_admin_all ON public.subscription_charge_items;
CREATE POLICY charge_items_admin_all ON public.subscription_charge_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fearless_leader'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fearless_leader'));

-- Owners can view their own charges
DROP POLICY IF EXISTS charge_items_owner_view ON public.subscription_charge_items;
CREATE POLICY charge_items_owner_view ON public.subscription_charge_items
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_charge_items_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_charge_items_updated_at ON public.subscription_charge_items;
CREATE TRIGGER trg_charge_items_updated_at BEFORE UPDATE ON public.subscription_charge_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_charge_items_updated_at();

-- ── 3. Auto-detect once-off activations (property scope) ─────────────────
CREATE OR REPLACE FUNCTION public.tg_detect_once_off_property() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.properties WHERE id = NEW.property_id;

  -- White-label
  IF COALESCE(NEW.white_label_allowed,false) = true
     AND COALESCE(NEW.white_label_setup_fee,0) > 0
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.white_label_allowed,false) = false
          OR COALESCE(OLD.white_label_setup_fee,0) = 0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE property_id = NEW.property_id AND kind = 'setup_whitelabel' AND status = 'pending'
     ) THEN
    INSERT INTO public.subscription_charge_items(property_id, owner_id, kind, description, amount)
    VALUES (NEW.property_id, v_owner, 'setup_whitelabel', 'White-label — setup fee', NEW.white_label_setup_fee);
  END IF;

  -- Branding add-on
  IF COALESCE(NEW.branding_addon_enabled,false) = true
     AND COALESCE(NEW.branding_addon_setup_fee,0) > 0
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.branding_addon_enabled,false) = false
          OR COALESCE(OLD.branding_addon_setup_fee,0) = 0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE property_id = NEW.property_id AND kind = 'setup_branding' AND status = 'pending'
     ) THEN
    INSERT INTO public.subscription_charge_items(property_id, owner_id, kind, description, amount)
    VALUES (NEW.property_id, v_owner, 'setup_branding', 'Branding add-on — setup fee', NEW.branding_addon_setup_fee);
  END IF;

  -- PriceLabs
  IF COALESCE(NEW.pricelabs_allowed,false) = true
     AND COALESCE(NEW.pricelabs_setup_fee,0) > 0
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.pricelabs_allowed,false) = false
          OR COALESCE(OLD.pricelabs_setup_fee,0) = 0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE property_id = NEW.property_id AND kind = 'setup_pricelabs' AND status = 'pending'
     ) THEN
    INSERT INTO public.subscription_charge_items(property_id, owner_id, kind, description, amount)
    VALUES (NEW.property_id, v_owner, 'setup_pricelabs', 'PriceLabs revenue management — setup fee', NEW.pricelabs_setup_fee);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_detect_once_off_property ON public.property_billing_configs;
CREATE TRIGGER trg_detect_once_off_property
  AFTER INSERT OR UPDATE ON public.property_billing_configs
  FOR EACH ROW EXECUTE FUNCTION public.tg_detect_once_off_property();

-- ── 4. Same for portfolio_billing_configs ────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_detect_once_off_portfolio() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM public.property_portfolios WHERE id = NEW.portfolio_id;

  IF COALESCE(NEW.white_label_allowed,false) = true
     AND COALESCE(NEW.white_label_setup_fee,0) > 0
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.white_label_allowed,false) = false
          OR COALESCE(OLD.white_label_setup_fee,0) = 0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE portfolio_id = NEW.portfolio_id AND kind = 'setup_whitelabel' AND status = 'pending'
     ) THEN
    INSERT INTO public.subscription_charge_items(portfolio_id, owner_id, kind, description, amount)
    VALUES (NEW.portfolio_id, v_owner, 'setup_whitelabel', 'White-label — setup fee', NEW.white_label_setup_fee);
  END IF;

  IF COALESCE(NEW.branding_addon_enabled,false) = true
     AND COALESCE(NEW.branding_addon_setup_fee,0) > 0
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.branding_addon_enabled,false) = false
          OR COALESCE(OLD.branding_addon_setup_fee,0) = 0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE portfolio_id = NEW.portfolio_id AND kind = 'setup_branding' AND status = 'pending'
     ) THEN
    INSERT INTO public.subscription_charge_items(portfolio_id, owner_id, kind, description, amount)
    VALUES (NEW.portfolio_id, v_owner, 'setup_branding', 'Branding add-on — setup fee', NEW.branding_addon_setup_fee);
  END IF;

  IF COALESCE(NEW.pricelabs_allowed,false) = true
     AND COALESCE(NEW.pricelabs_setup_fee,0) > 0
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.pricelabs_allowed,false) = false
          OR COALESCE(OLD.pricelabs_setup_fee,0) = 0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE portfolio_id = NEW.portfolio_id AND kind = 'setup_pricelabs' AND status = 'pending'
     ) THEN
    INSERT INTO public.subscription_charge_items(portfolio_id, owner_id, kind, description, amount)
    VALUES (NEW.portfolio_id, v_owner, 'setup_pricelabs', 'PriceLabs revenue management — setup fee', NEW.pricelabs_setup_fee);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_detect_once_off_portfolio ON public.portfolio_billing_configs;
CREATE TRIGGER trg_detect_once_off_portfolio
  AFTER INSERT OR UPDATE ON public.portfolio_billing_configs
  FOR EACH ROW EXECUTE FUNCTION public.tg_detect_once_off_portfolio();

-- ── 5. Admin RPCs ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.waive_subscription_charge(_charge_id uuid, _note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fearless_leader')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.subscription_charge_items
  SET status = 'waived', waived_at = now(), waived_by = auth.uid()
  WHERE id = _charge_id AND status = 'pending';
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION public.waive_subscription_charge(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_subscription_adjustment(
  _property_id uuid, _portfolio_id uuid, _description text, _amount numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_owner uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fearless_leader')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _property_id IS NOT NULL THEN
    SELECT owner_id INTO v_owner FROM public.properties WHERE id = _property_id;
  ELSE
    SELECT owner_id INTO v_owner FROM public.property_portfolios WHERE id = _portfolio_id;
  END IF;
  INSERT INTO public.subscription_charge_items(property_id, portfolio_id, owner_id, kind, description, amount)
  VALUES (_property_id, _portfolio_id, v_owner, 'adjustment', _description, _amount)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.add_subscription_adjustment(uuid, uuid, text, numeric) TO authenticated;

-- ── 6. Update the public pay-page RPC to expose line_items ───────────────
DROP FUNCTION IF EXISTS public.get_subscription_invoice_by_token(text);
CREATE OR REPLACE FUNCTION public.get_subscription_invoice_by_token(_token text)
RETURNS TABLE (
  id uuid, property_id uuid, portfolio_id uuid,
  amount numeric, subscription_amount numeric, once_off_amount numeric,
  currency text, period_start date, period_end date,
  status text, invoice_kind text, line_items jsonb, entity_name text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    i.id, i.property_id, i.portfolio_id,
    i.amount, i.subscription_amount, i.once_off_amount,
    i.currency, i.period_start, i.period_end,
    i.status, i.invoice_kind, i.line_items,
    COALESCE(p.name, pf.name, 'Rooms Online') AS entity_name
  FROM public.subscription_invoices i
  LEFT JOIN public.properties p ON p.id = i.property_id
  LEFT JOIN public.property_portfolios pf ON pf.id = i.portfolio_id
  WHERE i.payfast_token = _token
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.get_subscription_invoice_by_token(text) TO anon, authenticated;

-- ── 7. Delivery event log for PDF/email retries ──────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.subscription_invoices(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_invoice_events TO authenticated;
GRANT ALL ON public.subscription_invoice_events TO service_role;
ALTER TABLE public.subscription_invoice_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_events_admin ON public.subscription_invoice_events;
CREATE POLICY invoice_events_admin ON public.subscription_invoice_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fearless_leader'));

-- ── 8. Backfill existing pending activations ─────────────────────────────
-- Trigger the detection function against current rows by issuing no-op updates
UPDATE public.property_billing_configs SET updated_at = updated_at WHERE
  (COALESCE(white_label_allowed,false) AND COALESCE(white_label_setup_fee,0) > 0)
  OR (COALESCE(branding_addon_enabled,false) AND COALESCE(branding_addon_setup_fee,0) > 0)
  OR (COALESCE(pricelabs_allowed,false) AND COALESCE(pricelabs_setup_fee,0) > 0);

UPDATE public.portfolio_billing_configs SET updated_at = updated_at WHERE
  (COALESCE(white_label_allowed,false) AND COALESCE(white_label_setup_fee,0) > 0)
  OR (COALESCE(branding_addon_enabled,false) AND COALESCE(branding_addon_setup_fee,0) > 0)
  OR (COALESCE(pricelabs_allowed,false) AND COALESCE(pricelabs_setup_fee,0) > 0);
