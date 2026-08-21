ALTER TABLE public.report_source_files
  ADD COLUMN IF NOT EXISTS file_role text NOT NULL DEFAULT 'source';

ALTER TABLE public.report_source_files
  DROP CONSTRAINT IF EXISTS report_source_files_file_role_check;
ALTER TABLE public.report_source_files
  ADD CONSTRAINT report_source_files_file_role_check
  CHECK (file_role IN ('source', 'prior_report'));

ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS baseline_source text NOT NULL DEFAULT 'auto';
ALTER TABLE public.report_runs
  DROP CONSTRAINT IF EXISTS report_runs_baseline_source_check;
ALTER TABLE public.report_runs
  ADD CONSTRAINT report_runs_baseline_source_check
  CHECK (baseline_source IN ('auto', 'manual', 'imported'));

ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS imported_baseline jsonb;