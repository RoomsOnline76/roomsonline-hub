ALTER TABLE public.property_report_settings
  ADD COLUMN IF NOT EXISTS nb_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.property_report_settings.nb_profile IS
  'Per-property NightsBridge quirks: exclude_patterns, keep_patterns, route_tokens, sheet_map, group_property_ids, group_label, stly_from_prior_workbook, historical_from_current_ledger.';