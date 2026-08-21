CREATE TABLE public.report_insights (
  run_id uuid NOT NULL PRIMARY KEY REFERENCES public.report_runs(id) ON DELETE CASCADE,
  narrative text,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '{}'::jsonb,
  chart_recommendation text,
  provider text,
  generated_by uuid,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_insights TO authenticated;
GRANT ALL ON public.report_insights TO service_role;
ALTER TABLE public.report_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports staff manage insights"
ON public.report_insights FOR ALL TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));

CREATE TRIGGER update_report_insights_updated_at
BEFORE UPDATE ON public.report_insights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();