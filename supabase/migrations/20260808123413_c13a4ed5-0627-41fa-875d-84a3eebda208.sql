-- receipt number on invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS receipt_number text;

-- helper: is the current user the dev owner account?
CREATE OR REPLACE FUNCTION public.is_cost_share_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), '')) = 'dev@roomsonline.co.za'
$$;

CREATE OR REPLACE FUNCTION public.can_view_cost_share()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'dev'::app_role)
      OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
$$;

CREATE TABLE IF NOT EXISTS public.rol_cost_share_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  split_active boolean NOT NULL DEFAULT false,
  roomsonline_pct numeric NOT NULL DEFAULT 60,
  partner_pct numeric NOT NULL DEFAULT 40,
  commissioning_complete boolean NOT NULL DEFAULT false,
  commissioned_at timestamptz,
  statement_fx_usd_zar numeric NOT NULL DEFAULT 16.50,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rol_cost_share_config TO authenticated;
GRANT ALL ON public.rol_cost_share_config TO service_role;
ALTER TABLE public.rol_cost_share_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dev and leader can view cost share config"
  ON public.rol_cost_share_config FOR SELECT TO authenticated
  USING (public.can_view_cost_share());
CREATE POLICY "Owner can insert cost share config"
  ON public.rol_cost_share_config FOR INSERT TO authenticated
  WITH CHECK (public.is_cost_share_owner());
CREATE POLICY "Owner can update cost share config"
  ON public.rol_cost_share_config FOR UPDATE TO authenticated
  USING (public.is_cost_share_owner()) WITH CHECK (public.is_cost_share_owner());

CREATE TABLE IF NOT EXISTS public.rol_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_key text NOT NULL,
  contributor_name text NOT NULL,
  contribution_date date NOT NULL DEFAULT current_date,
  amount numeric NOT NULL,
  source_currency text NOT NULL DEFAULT 'ZAR',
  amount_zar numeric NOT NULL,
  method text,
  reference text,
  notes text,
  document_path text,
  document_name text,
  document_size integer,
  document_type text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rol_contributions TO authenticated;
GRANT ALL ON public.rol_contributions TO service_role;
ALTER TABLE public.rol_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dev and leader can view contributions"
  ON public.rol_contributions FOR SELECT TO authenticated
  USING (public.can_view_cost_share());
CREATE POLICY "Owner can insert contributions"
  ON public.rol_contributions FOR INSERT TO authenticated
  WITH CHECK (public.is_cost_share_owner());
CREATE POLICY "Owner can update contributions"
  ON public.rol_contributions FOR UPDATE TO authenticated
  USING (public.is_cost_share_owner()) WITH CHECK (public.is_cost_share_owner());
CREATE POLICY "Owner can delete contributions"
  ON public.rol_contributions FOR DELETE TO authenticated
  USING (public.is_cost_share_owner());

CREATE TRIGGER update_rol_cost_share_config_updated_at
  BEFORE UPDATE ON public.rol_cost_share_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_rol_contributions_updated_at
  BEFORE UPDATE ON public.rol_contributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.rol_cost_share_config (singleton) VALUES (true)
  ON CONFLICT (singleton) DO NOTHING;