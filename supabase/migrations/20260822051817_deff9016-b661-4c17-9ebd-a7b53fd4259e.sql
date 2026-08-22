CREATE TABLE public.report_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  byte_size BIGINT,
  content_type TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_media_run ON public.report_media(run_id, slot_key, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_media TO authenticated;
GRANT ALL ON public.report_media TO service_role;

ALTER TABLE public.report_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports staff manage report media"
ON public.report_media FOR ALL
TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));

CREATE TRIGGER update_report_media_updated_at
BEFORE UPDATE ON public.report_media
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();