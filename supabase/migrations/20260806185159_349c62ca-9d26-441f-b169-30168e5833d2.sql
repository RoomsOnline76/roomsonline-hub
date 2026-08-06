-- ============ enums ============
CREATE TYPE public.crm_account_type AS ENUM ('company','travel_agent','tour_operator','source');

-- ============ crm_accounts ============
CREATE TABLE public.crm_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  account_type public.crm_account_type NOT NULL DEFAULT 'company',
  name text NOT NULL,
  contact_title text,
  contact_first_name text,
  contact_last_name text,
  email text,
  phone text,
  website text,
  vat_number text,
  registration_number text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  country text,
  default_commission_rate numeric(6,3),
  payment_terms_days integer,
  is_credit_account boolean NOT NULL DEFAULT false,
  currency text DEFAULT 'ZAR',
  tags text[] DEFAULT '{}',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_accounts_scope_chk CHECK (portfolio_id IS NOT NULL OR property_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_accounts TO authenticated;
GRANT ALL ON public.crm_accounts TO service_role;
ALTER TABLE public.crm_accounts ENABLE ROW LEVEL SECURITY;

-- ============ crm_bookers ============
CREATE TABLE public.crm_bookers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_bookers_scope_chk CHECK (portfolio_id IS NOT NULL OR property_id IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bookers TO authenticated;
GRANT ALL ON public.crm_bookers TO service_role;
ALTER TABLE public.crm_bookers ENABLE ROW LEVEL SECURITY;

-- ============ access helper: portfolio-scoped CRM access ============
CREATE OR REPLACE FUNCTION public.can_access_crm_scope(_portfolio_id uuid, _property_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'dev')
    OR public.has_role(_user_id, 'fearless_leader')
    OR (_property_id IS NOT NULL AND public.can_access_property(_property_id, _user_id))
    OR (
      _portfolio_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.property_portfolio_members m
        WHERE m.portfolio_id = _portfolio_id
          AND public.can_access_property(m.property_id, _user_id)
      )
    )
    OR (
      _portfolio_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.property_portfolios p
        WHERE p.id = _portfolio_id AND p.owner_id = _user_id
      )
    )
$$;

CREATE POLICY "CRM accounts readable within scope"
  ON public.crm_accounts FOR SELECT TO authenticated
  USING (public.can_access_crm_scope(portfolio_id, property_id, auth.uid()));

CREATE POLICY "CRM accounts manageable within scope"
  ON public.crm_accounts FOR ALL TO authenticated
  USING (public.can_access_crm_scope(portfolio_id, property_id, auth.uid()))
  WITH CHECK (public.can_access_crm_scope(portfolio_id, property_id, auth.uid()));

CREATE POLICY "CRM bookers readable within scope"
  ON public.crm_bookers FOR SELECT TO authenticated
  USING (public.can_access_crm_scope(portfolio_id, property_id, auth.uid()));

CREATE POLICY "CRM bookers manageable within scope"
  ON public.crm_bookers FOR ALL TO authenticated
  USING (public.can_access_crm_scope(portfolio_id, property_id, auth.uid()))
  WITH CHECK (public.can_access_crm_scope(portfolio_id, property_id, auth.uid()));

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_crm_accounts_updated_at BEFORE UPDATE ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_crm_bookers_updated_at BEFORE UPDATE ON public.crm_bookers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ indexes ============
CREATE INDEX idx_crm_accounts_portfolio ON public.crm_accounts(portfolio_id) WHERE portfolio_id IS NOT NULL;
CREATE INDEX idx_crm_accounts_property ON public.crm_accounts(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX idx_crm_accounts_type ON public.crm_accounts(account_type);
CREATE INDEX idx_crm_bookers_portfolio ON public.crm_bookers(portfolio_id) WHERE portfolio_id IS NOT NULL;
CREATE INDEX idx_crm_bookers_property ON public.crm_bookers(property_id) WHERE property_id IS NOT NULL;

-- ============ bookings: booker & segmentation ============
ALTER TABLE public.bookings
  ADD COLUMN booker_id uuid REFERENCES public.crm_bookers(id) ON DELETE SET NULL,
  ADD COLUMN booker_name text,
  ADD COLUMN booker_email text,
  ADD COLUMN booker_phone text,
  ADD COLUMN booker_is_guest boolean NOT NULL DEFAULT true,
  ADD COLUMN company_account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  ADD COLUMN agent_account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  ADD COLUMN source_account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL,
  ADD COLUMN market_segment text,
  ADD COLUMN comm_channel text,
  ADD COLUMN invoice_to_name text,
  ADD COLUMN invoice_to_vat text,
  ADD COLUMN invoice_to_address text;

CREATE INDEX idx_bookings_company_account ON public.bookings(company_account_id) WHERE company_account_id IS NOT NULL;
CREATE INDEX idx_bookings_agent_account ON public.bookings(agent_account_id) WHERE agent_account_id IS NOT NULL;
CREATE INDEX idx_bookings_market_segment ON public.bookings(market_segment) WHERE market_segment IS NOT NULL;

-- ============ account stats view ============
CREATE OR REPLACE VIEW public.crm_account_stats
WITH (security_invoker = true)
AS
SELECT
  a.id AS account_id,
  COUNT(b.id) AS booking_count,
  COALESCE(SUM(GREATEST((b.check_out_date - b.check_in_date), 0)), 0) AS room_nights,
  COALESCE(SUM(b.total_price), 0) AS total_revenue,
  MAX(b.check_in_date) AS last_booking_date
FROM public.crm_accounts a
LEFT JOIN public.bookings b
  ON (b.company_account_id = a.id OR b.agent_account_id = a.id OR b.source_account_id = a.id)
  AND b.status NOT IN ('cancelled','failed')
GROUP BY a.id;

GRANT SELECT ON public.crm_account_stats TO authenticated;
GRANT SELECT ON public.crm_account_stats TO service_role;
