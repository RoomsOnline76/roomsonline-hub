ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS draft_report_path text,
  ADD COLUMN IF NOT EXISTS draft_generated_at timestamp with time zone;