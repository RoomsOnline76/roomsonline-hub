ALTER TABLE public.report_runs ADD COLUMN IF NOT EXISTS report_month date;

UPDATE public.report_runs
SET report_month = CASE
  WHEN EXTRACT(DAY FROM as_of_date) < 5
    THEN (date_trunc('month', as_of_date::timestamp) - interval '1 month')::date
  ELSE date_trunc('month', as_of_date::timestamp)::date
END
WHERE report_month IS NULL;