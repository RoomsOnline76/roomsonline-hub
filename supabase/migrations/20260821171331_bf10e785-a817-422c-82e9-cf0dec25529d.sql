ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS baseline_locked boolean NOT NULL DEFAULT false;