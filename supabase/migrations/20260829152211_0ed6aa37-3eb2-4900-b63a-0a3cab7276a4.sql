ALTER TABLE public.property_report_settings
  ADD COLUMN IF NOT EXISTS report_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.property_report_settings.report_profile IS
  'Source-agnostic report presentation profile: compare_years, stly_from_prior_workbook, source_unavailable, source_mode, year_columns.';

ALTER TABLE public.report_snapshots
  ADD COLUMN IF NOT EXISTS actuals_by_year jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stly jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.report_snapshots.actuals_by_year IS
  'Calendar-year actual series keyed "YYYY" -> { revenue, room_nights, occupancy, adr } month maps.';
COMMENT ON COLUMN public.report_snapshots.stly IS
  'Same-time-last-year series: { as_of, revenue, room_nights, occupancy, adr }.';