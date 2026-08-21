-- Shared access predicate for the Revenue Reports subdomain
CREATE OR REPLACE FUNCTION public.has_reports_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'dev'::app_role)
      OR public.has_role(_user_id, 'fearless_leader'::app_role)
$$;

CREATE TABLE public.report_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'nightsbridge',
  as_of_date date NOT NULL,
  previous_run_id uuid REFERENCES public.report_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  title text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_runs_property ON public.report_runs(property_id, as_of_date DESC);
CREATE INDEX idx_report_runs_created ON public.report_runs(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_runs TO authenticated;
GRANT ALL ON public.report_runs TO service_role;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports staff manage runs"
ON public.report_runs FOR ALL TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));

CREATE TABLE public.report_source_files (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  byte_size bigint,
  file_hash text,
  parsed_ok boolean,
  parse_errors jsonb,
  row_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_source_files_run ON public.report_source_files(run_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_source_files TO authenticated;
GRANT ALL ON public.report_source_files TO service_role;
ALTER TABLE public.report_source_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports staff manage source files"
ON public.report_source_files FOR ALL TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));

CREATE TRIGGER update_report_runs_updated_at
BEFORE UPDATE ON public.report_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_report_source_files_updated_at
BEFORE UPDATE ON public.report_source_files
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for the private revenue-reports bucket
CREATE POLICY "Reports staff read revenue report files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'revenue-reports' AND public.has_reports_access(auth.uid()));

CREATE POLICY "Reports staff upload revenue report files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'revenue-reports' AND public.has_reports_access(auth.uid()));

CREATE POLICY "Reports staff update revenue report files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'revenue-reports' AND public.has_reports_access(auth.uid()));

CREATE POLICY "Reports staff delete revenue report files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'revenue-reports' AND public.has_reports_access(auth.uid()));