CREATE TABLE public.report_comparison_months (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  fiscal_year_label TEXT NOT NULL,
  month DATE NOT NULL,
  bob NUMERIC,
  occupancy NUMERIC,
  budget NUMERIC,
  stly NUMERIC,
  stly_occupancy NUMERIC,
  last_year NUMERIC,
  last_year_occupancy NUMERIC,
  source TEXT NOT NULL DEFAULT 'import',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, month)
);

CREATE INDEX report_comparison_months_property_idx
  ON public.report_comparison_months (property_id, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_comparison_months TO authenticated;
GRANT ALL ON public.report_comparison_months TO service_role;

ALTER TABLE public.report_comparison_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports staff manage comparison months"
ON public.report_comparison_months
FOR ALL
TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));