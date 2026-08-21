ALTER TABLE public.property_report_settings
  ADD COLUMN IF NOT EXISTS special_report_set text;

COMMENT ON COLUMN public.property_report_settings.special_report_set IS
  'Optional specialised report pack for this property, e.g. ''cheetaplains''. NULL means the standard pack only.';

UPDATE public.property_report_settings s
SET special_report_set = 'cheetaplains'
FROM public.properties p
WHERE p.id = s.property_id
  AND s.special_report_set IS NULL
  AND (p.name ILIKE '%cheetah plains%' OR p.name ILIKE '%cheetaplains%');

CREATE TABLE IF NOT EXISTS public.report_special_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  report_key text NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, report_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_special_reports TO authenticated;
GRANT ALL ON public.report_special_reports TO service_role;

ALTER TABLE public.report_special_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports staff manage special reports"
ON public.report_special_reports FOR ALL TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_report_special_reports_run ON public.report_special_reports(run_id);

CREATE TRIGGER update_report_special_reports_updated_at
BEFORE UPDATE ON public.report_special_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();