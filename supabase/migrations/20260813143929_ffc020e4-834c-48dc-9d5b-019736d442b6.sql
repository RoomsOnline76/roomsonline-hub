CREATE TABLE public.background_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type text NOT NULL,
  dedupe_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_after timestamptz NOT NULL DEFAULT now(),
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.background_jobs TO authenticated;
GRANT ALL ON public.background_jobs TO service_role;

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view background jobs"
  ON public.background_jobs FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_background_jobs_due
  ON public.background_jobs (status, run_after);

CREATE UNIQUE INDEX idx_background_jobs_pending_dedupe
  ON public.background_jobs (job_type, dedupe_key)
  WHERE status = 'pending' AND dedupe_key IS NOT NULL;

CREATE TRIGGER update_background_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();