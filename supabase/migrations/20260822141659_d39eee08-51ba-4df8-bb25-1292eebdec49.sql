ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS build_stage text NOT NULL DEFAULT 'parse',
  ADD COLUMN IF NOT EXISTS prior_report_declined boolean NOT NULL DEFAULT false;