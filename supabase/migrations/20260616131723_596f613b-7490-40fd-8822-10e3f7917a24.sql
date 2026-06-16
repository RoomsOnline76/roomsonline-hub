
-- Enums
DO $$ BEGIN
  CREATE TYPE public.portfolio_share_basis AS ENUM ('gross_total','net_accommodation','net_after_rl_fees');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.portfolio_share_origin AS ENUM ('portfolio_link','cross_property_site');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.portfolio_share_attr_status AS ENUM ('pending','invoiced','paid','waived','disputed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.portfolio_share_invoice_status AS ENUM ('draft','sent','paid','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Origin tracking on bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS origin_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_type text,
  ADD COLUMN IF NOT EXISTS origin_url text;

CREATE INDEX IF NOT EXISTS idx_bookings_origin_property ON public.bookings(origin_property_id) WHERE origin_property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_origin_portfolio ON public.bookings(origin_portfolio_id) WHERE origin_portfolio_id IS NOT NULL;

-- 1. Portfolio share config
CREATE TABLE IF NOT EXISTS public.portfolio_revenue_share_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL UNIQUE REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  share_basis public.portfolio_share_basis NOT NULL DEFAULT 'net_accommodation',
  include_portfolio_origin boolean NOT NULL DEFAULT true,
  include_cross_property_origin boolean NOT NULL DEFAULT true,
  portfolio_origin_default_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (portfolio_origin_default_percent >= 0 AND portfolio_origin_default_percent <= 100),
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_revenue_share_config TO authenticated;
GRANT ALL ON public.portfolio_revenue_share_config TO service_role;
ALTER TABLE public.portfolio_revenue_share_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage portfolio share config" ON public.portfolio_revenue_share_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

CREATE POLICY "Portfolio members view share config" ON public.portfolio_revenue_share_config
  FOR SELECT TO authenticated
  USING (user_can_access_portfolio(portfolio_id, auth.uid()));

CREATE TRIGGER trg_share_config_updated BEFORE UPDATE ON public.portfolio_revenue_share_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Pairwise share %
CREATE TABLE IF NOT EXISTS public.portfolio_revenue_share_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  from_property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  to_property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  share_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (share_percent >= 0 AND share_percent <= 100),
  set_by_user_id uuid,
  set_by_role text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, from_property_id, to_property_id),
  CHECK (from_property_id <> to_property_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_revenue_share_pairs TO authenticated;
GRANT ALL ON public.portfolio_revenue_share_pairs TO service_role;
ALTER TABLE public.portfolio_revenue_share_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage share pairs" ON public.portfolio_revenue_share_pairs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

CREATE POLICY "Owners view share pairs for own properties" ON public.portfolio_revenue_share_pairs
  FOR SELECT TO authenticated
  USING (
    is_property_owner(from_property_id, auth.uid()) OR is_linked_owner(from_property_id, auth.uid())
    OR is_property_owner(to_property_id, auth.uid()) OR is_linked_owner(to_property_id, auth.uid())
    OR user_can_access_portfolio(portfolio_id, auth.uid())
  );

CREATE POLICY "Owners edit share pairs for own properties" ON public.portfolio_revenue_share_pairs
  FOR INSERT TO authenticated
  WITH CHECK (
    is_property_owner(from_property_id, auth.uid()) OR is_linked_owner(from_property_id, auth.uid())
    OR is_property_owner(to_property_id, auth.uid()) OR is_linked_owner(to_property_id, auth.uid())
  );

CREATE POLICY "Owners update share pairs for own properties" ON public.portfolio_revenue_share_pairs
  FOR UPDATE TO authenticated
  USING (
    is_property_owner(from_property_id, auth.uid()) OR is_linked_owner(from_property_id, auth.uid())
    OR is_property_owner(to_property_id, auth.uid()) OR is_linked_owner(to_property_id, auth.uid())
  )
  WITH CHECK (
    is_property_owner(from_property_id, auth.uid()) OR is_linked_owner(from_property_id, auth.uid())
    OR is_property_owner(to_property_id, auth.uid()) OR is_linked_owner(to_property_id, auth.uid())
  );

CREATE TRIGGER trg_share_pairs_updated BEFORE UPDATE ON public.portfolio_revenue_share_pairs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_share_pairs_portfolio ON public.portfolio_revenue_share_pairs(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_share_pairs_from ON public.portfolio_revenue_share_pairs(from_property_id);
CREATE INDEX IF NOT EXISTS idx_share_pairs_to ON public.portfolio_revenue_share_pairs(to_property_id);

-- 4. Monthly invoices (created first because attributions reference it)
CREATE TABLE IF NOT EXISTS public.portfolio_share_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  from_property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  to_property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  status public.portfolio_share_invoice_status NOT NULL DEFAULT 'draft',
  invoice_number text,
  pdf_url text,
  notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, from_property_id, to_property_id, period_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_share_invoices TO authenticated;
GRANT ALL ON public.portfolio_share_invoices TO service_role;
ALTER TABLE public.portfolio_share_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage share invoices" ON public.portfolio_share_invoices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

CREATE POLICY "Owners view their share invoices" ON public.portfolio_share_invoices
  FOR SELECT TO authenticated
  USING (
    is_property_owner(from_property_id, auth.uid()) OR is_linked_owner(from_property_id, auth.uid())
    OR is_property_owner(to_property_id, auth.uid()) OR is_linked_owner(to_property_id, auth.uid())
  );

CREATE TRIGGER trg_share_invoices_updated BEFORE UPDATE ON public.portfolio_share_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Booking attributions
CREATE TABLE IF NOT EXISTS public.booking_revenue_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  from_property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  to_property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  origin_type public.portfolio_share_origin NOT NULL,
  origin_url text,
  basis_amount numeric(12,2) NOT NULL DEFAULT 0,
  share_percent numeric(5,2) NOT NULL DEFAULT 0,
  share_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  status public.portfolio_share_attr_status NOT NULL DEFAULT 'pending',
  invoice_id uuid REFERENCES public.portfolio_share_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, portfolio_id, from_property_id, to_property_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_revenue_attributions TO authenticated;
GRANT ALL ON public.booking_revenue_attributions TO service_role;
ALTER TABLE public.booking_revenue_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage booking attributions" ON public.booking_revenue_attributions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

CREATE POLICY "Owners view their booking attributions" ON public.booking_revenue_attributions
  FOR SELECT TO authenticated
  USING (
    is_property_owner(from_property_id, auth.uid()) OR is_linked_owner(from_property_id, auth.uid())
    OR is_property_owner(to_property_id, auth.uid()) OR is_linked_owner(to_property_id, auth.uid())
  );

CREATE TRIGGER trg_attr_updated BEFORE UPDATE ON public.booking_revenue_attributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_attr_from ON public.booking_revenue_attributions(from_property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attr_to ON public.booking_revenue_attributions(to_property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attr_invoice ON public.booking_revenue_attributions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_attr_status ON public.booking_revenue_attributions(status);

-- Attribution function (callable from edge/trigger)
CREATE OR REPLACE FUNCTION public.attribute_portfolio_share(_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  cfg record;
  pair record;
  basis numeric(12,2);
  share numeric(12,2);
  pct numeric(5,2);
  pf uuid;
BEGIN
  SELECT * INTO b FROM bookings WHERE id = _booking_id;
  IF NOT FOUND OR b.status NOT IN ('confirmed','paid','completed') THEN RETURN; END IF;

  -- Case 1: cross-property origin
  IF b.origin_property_id IS NOT NULL AND b.origin_property_id <> b.property_id THEN
    FOR pf IN
      SELECT m1.portfolio_id
      FROM property_portfolio_members m1
      JOIN property_portfolio_members m2 ON m1.portfolio_id = m2.portfolio_id
      WHERE m1.property_id = b.origin_property_id AND m2.property_id = b.property_id
    LOOP
      SELECT * INTO cfg FROM portfolio_revenue_share_config WHERE portfolio_id = pf;
      IF NOT FOUND OR NOT cfg.include_cross_property_origin THEN CONTINUE; END IF;

      SELECT share_percent INTO pct FROM portfolio_revenue_share_pairs
        WHERE portfolio_id = pf AND from_property_id = b.origin_property_id AND to_property_id = b.property_id;
      IF pct IS NULL OR pct = 0 THEN CONTINUE; END IF;

      basis := COALESCE(b.total_price, 0);
      share := ROUND(basis * pct / 100.0, 2);

      INSERT INTO booking_revenue_attributions (booking_id, portfolio_id, from_property_id, to_property_id, origin_type, origin_url, basis_amount, share_percent, share_amount)
      VALUES (b.id, pf, b.origin_property_id, b.property_id, 'cross_property_site', b.origin_url, basis, pct, share)
      ON CONFLICT (booking_id, portfolio_id, from_property_id, to_property_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Case 2: portfolio_link origin (origin_portfolio_id set)
  IF b.origin_portfolio_id IS NOT NULL THEN
    SELECT * INTO cfg FROM portfolio_revenue_share_config WHERE portfolio_id = b.origin_portfolio_id;
    IF FOUND AND cfg.include_portfolio_origin AND cfg.portfolio_origin_default_percent > 0 THEN
      basis := COALESCE(b.total_price, 0);
      pct := cfg.portfolio_origin_default_percent;
      share := ROUND(basis * pct / 100.0, 2);
      INSERT INTO booking_revenue_attributions (booking_id, portfolio_id, from_property_id, to_property_id, origin_type, origin_url, basis_amount, share_percent, share_amount)
      VALUES (b.id, b.origin_portfolio_id, b.property_id, b.property_id, 'portfolio_link', b.origin_url, basis, pct, share)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END;
$$;

-- Trigger to auto-run on confirmation
CREATE OR REPLACE FUNCTION public.trg_attribute_share()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('confirmed','paid','completed')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.attribute_portfolio_share(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bookings_attribute_share ON public.bookings;
CREATE TRIGGER trg_bookings_attribute_share
AFTER INSERT OR UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_attribute_share();
