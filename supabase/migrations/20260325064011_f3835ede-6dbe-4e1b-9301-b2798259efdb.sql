
-- Enums for commission module
CREATE TYPE public.commission_tier AS ENUM ('base', 'accelerated', 'elite');
CREATE TYPE public.lead_source AS ENUM ('cold_call', 'referral', 'event', 'inbound', 'partner', 'social_media', 'existing_client', 'other');
CREATE TYPE public.referral_status AS ENUM ('pending', 'qualified', 'converted', 'churned');
CREATE TYPE public.commission_entry_status AS ENUM ('pending', 'approved', 'paid', 'clawed_back');
CREATE TYPE public.commission_report_status AS ENUM ('draft', 'pending_approval', 'approved', 'paid');

-- 1. Sales reps table
CREATE TABLE public.sales_reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rep_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  email text NOT NULL,
  phone text,
  commission_tier commission_tier NOT NULL DEFAULT 'base',
  is_active boolean NOT NULL DEFAULT true,
  quarterly_target integer DEFAULT 5,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Property referrals table
CREATE TABLE public.property_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE UNIQUE,
  rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  lead_source lead_source NOT NULL DEFAULT 'other',
  lead_notes text,
  referral_date date NOT NULL DEFAULT CURRENT_DATE,
  status referral_status NOT NULL DEFAULT 'pending',
  clawback_until date,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Rep commission entries
CREATE TABLE public.rep_commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  referral_id uuid NOT NULL REFERENCES public.property_referrals(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  base_revenue numeric(12,2) NOT NULL DEFAULT 0,
  commission_type text NOT NULL CHECK (commission_type IN ('first_year', 'residual')),
  rate_applied numeric(5,2) NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status commission_entry_status NOT NULL DEFAULT 'pending',
  clawback_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Rep commission reports (monthly aggregate)
CREATE TABLE public.rep_commission_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  total_entries integer NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  status commission_report_status NOT NULL DEFAULT 'draft',
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  UNIQUE (rep_id, period_month)
);

-- 5. Extend billing_global_defaults with referral commission columns
ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS referral_first_year_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS referral_residual_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS referral_residual_months integer DEFAULT 12,
  ADD COLUMN IF NOT EXISTS referral_clawback_days integer DEFAULT 90;

-- 6. Trigger to auto-set clawback_until
CREATE OR REPLACE FUNCTION public.set_clawback_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.clawback_until IS NULL THEN
    NEW.clawback_until := NEW.referral_date + COALESCE(
      (SELECT referral_clawback_days FROM billing_global_defaults LIMIT 1),
      90
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_clawback_date
  BEFORE INSERT ON public.property_referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_clawback_date();

-- 7. Enable RLS
ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rep_commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rep_commission_reports ENABLE ROW LEVEL SECURITY;

-- RLS: Admin/dev/fearless_leader full access
CREATE POLICY "Admin full access on sales_reps"
  ON public.sales_reps FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin full access on property_referrals"
  ON public.property_referrals FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin full access on rep_commission_entries"
  ON public.rep_commission_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin full access on rep_commission_reports"
  ON public.rep_commission_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- RLS: Reps can read their own data
CREATE POLICY "Reps read own sales_reps"
  ON public.sales_reps FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Reps read own commission entries"
  ON public.rep_commission_entries FOR SELECT TO authenticated
  USING (rep_id IN (SELECT id FROM public.sales_reps WHERE user_id = auth.uid()));

CREATE POLICY "Reps read own commission reports"
  ON public.rep_commission_reports FOR SELECT TO authenticated
  USING (rep_id IN (SELECT id FROM public.sales_reps WHERE user_id = auth.uid()));
