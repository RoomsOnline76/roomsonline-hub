ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS report_kind text NOT NULL DEFAULT 'revenue_review';

ALTER TABLE public.property_report_settings
  ADD COLUMN IF NOT EXISTS daily_workbook_path text,
  ADD COLUMN IF NOT EXISTS daily_workbook_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS public.report_daily_days (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.report_runs(id) ON DELETE SET NULL,
  report_date date NOT NULL,
  figures jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, report_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_daily_days TO authenticated;
GRANT ALL ON public.report_daily_days TO service_role;

ALTER TABLE public.report_daily_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports staff manage daily days"
  ON public.report_daily_days
  FOR ALL
  USING (public.has_reports_access(auth.uid()))
  WITH CHECK (public.has_reports_access(auth.uid()));

CREATE TRIGGER update_report_daily_days_updated_at
  BEFORE UPDATE ON public.report_daily_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS report_daily_days_property_date_idx
  ON public.report_daily_days (property_id, report_date);