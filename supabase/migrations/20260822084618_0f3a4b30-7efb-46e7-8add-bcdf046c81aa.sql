ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'bimonthly';

ALTER TABLE public.report_runs
  DROP CONSTRAINT IF EXISTS report_runs_cadence_check;

ALTER TABLE public.report_runs
  ADD CONSTRAINT report_runs_cadence_check CHECK (cadence IN ('monthly', 'bimonthly'));