UPDATE public.property_report_settings
SET room_count = 7,
    report_profile = jsonb_build_object(
      'compare_years', '[]'::jsonb,
      'stly_from_prior_workbook', false,
      'source_unavailable', true,
      'source_mode', 'prior_workbook_only',
      'year_columns', '["target"]'::jsonb
    ),
    updated_at = now()
WHERE property_id = '711c1882-6609-42ed-bcef-f335fd62df1d';