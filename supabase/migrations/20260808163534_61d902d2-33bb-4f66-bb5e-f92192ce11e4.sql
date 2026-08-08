-- 1. Statement columns on rep_commission_reports
ALTER TABLE public.rep_commission_reports
  ADD COLUMN IF NOT EXISTS statement_reference text,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS total_revenue numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_commission numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustments_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS property_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by uuid,
  ADD COLUMN IF NOT EXISTS paid_reference text,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz,
  ADD COLUMN IF NOT EXISTS emailed_to text;

CREATE UNIQUE INDEX IF NOT EXISTS rep_commission_reports_reference_key
  ON public.rep_commission_reports (statement_reference)
  WHERE statement_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rep_commission_reports_rep_period_key
  ON public.rep_commission_reports (rep_id, period_month);

-- 2. Line-level detail on rep_commission_entries
ALTER TABLE public.rep_commission_entries
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.rep_commission_reports(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS revenue_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS line_kind text NOT NULL DEFAULT 'commission',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS referral_started_on date;

ALTER TABLE public.rep_commission_entries
  ALTER COLUMN referral_id DROP NOT NULL,
  ALTER COLUMN property_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rep_commission_entries_line_kind_check'
  ) THEN
    ALTER TABLE public.rep_commission_entries
      ADD CONSTRAINT rep_commission_entries_line_kind_check
      CHECK (line_kind IN ('commission', 'adjustment', 'clawback'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rep_commission_entries_report_idx
  ON public.rep_commission_entries (report_id);

-- 3. Sequential statement references
CREATE TABLE IF NOT EXISTS public.commission_reference_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL UNIQUE,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.commission_reference_counters TO authenticated;
GRANT ALL ON public.commission_reference_counters TO service_role;

ALTER TABLE public.commission_reference_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Commission admins read counters"
  ON public.commission_reference_counters
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
  );

CREATE OR REPLACE FUNCTION public.next_commission_statement_reference(
  _rep_code text,
  _period_month date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(coalesce(nullif(regexp_replace(coalesce(_rep_code, ''), '[^A-Za-z0-9]', '', 'g'), ''), 'REP'));
  v_period text := to_char(_period_month, 'YYYYMM');
  v_scope text;
  v_next integer;
BEGIN
  v_scope := 'COM-' || v_code || '-' || v_period;

  INSERT INTO public.commission_reference_counters (scope_key, last_value)
  VALUES (v_scope, 1)
  ON CONFLICT (scope_key)
  DO UPDATE SET last_value = public.commission_reference_counters.last_value + 1,
                updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN 'ROL-COM-' || v_code || '-' || v_period || '-' || lpad(v_next::text, 2, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_commission_statement_reference(text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.next_commission_statement_reference(text, date) TO service_role;

-- 4. Refresh policies: include fearless_leader parity, drop duplicate rep policies
DROP POLICY IF EXISTS "Admin full access on rep_commission_reports" ON public.rep_commission_reports;
DROP POLICY IF EXISTS "Rep views own commission reports" ON public.rep_commission_reports;
DROP POLICY IF EXISTS "Reps read own commission reports" ON public.rep_commission_reports;

CREATE POLICY "Commission admins manage statements"
  ON public.rep_commission_reports
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

CREATE POLICY "Reps read own commission statements"
  ON public.rep_commission_reports
  FOR SELECT
  TO authenticated
  USING (rep_id IN (SELECT id FROM public.sales_reps WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admin full access on rep_commission_entries" ON public.rep_commission_entries;
DROP POLICY IF EXISTS "Reps read own commission entries" ON public.rep_commission_entries;

CREATE POLICY "Commission admins manage lines"
  ON public.rep_commission_entries
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

CREATE POLICY "Reps read own commission lines"
  ON public.rep_commission_entries
  FOR SELECT
  TO authenticated
  USING (rep_id IN (SELECT id FROM public.sales_reps WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_commission_reports TO authenticated;
GRANT ALL ON public.rep_commission_reports TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_commission_entries TO authenticated;
GRANT ALL ON public.rep_commission_entries TO service_role;