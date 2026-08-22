CREATE TABLE public.report_media_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'Additional Slides',
  title TEXT NOT NULL,
  hint TEXT,
  layout TEXT NOT NULL DEFAULT 'full',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (run_id, slot_key)
);

CREATE INDEX idx_report_media_slots_run ON public.report_media_slots(run_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_media_slots TO authenticated;
GRANT ALL ON public.report_media_slots TO service_role;

ALTER TABLE public.report_media_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports staff manage report media slots"
ON public.report_media_slots FOR ALL
TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));

CREATE TRIGGER update_report_media_slots_updated_at
BEFORE UPDATE ON public.report_media_slots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.report_runs ADD COLUMN IF NOT EXISTS page_order JSONB;