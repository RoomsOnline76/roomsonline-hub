CREATE TABLE public.report_run_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_run_events_run ON public.report_run_events(run_id, created_at DESC);

GRANT SELECT, INSERT ON public.report_run_events TO authenticated;
GRANT ALL ON public.report_run_events TO service_role;
ALTER TABLE public.report_run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports staff read run events"
ON public.report_run_events FOR SELECT TO authenticated
USING (public.has_reports_access(auth.uid()));

CREATE POLICY "Reports staff write run events"
ON public.report_run_events FOR INSERT TO authenticated
WITH CHECK (public.has_reports_access(auth.uid()));

ALTER TABLE public.report_runs ADD COLUMN IF NOT EXISTS processing_note text;