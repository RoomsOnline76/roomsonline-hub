-- Devonvale: canonical record 61da5009, profile from duplicate 583e3a4a
INSERT INTO public.property_report_settings (property_id, room_count, default_source_type, report_profile)
VALUES ('61da5009-213d-42ec-ade7-9fd28c0a3696', 47, 'protel',
  '{"source_mode":"prior_workbook_only","year_columns":[],"compare_years":[],"source_unavailable":true,"stly_from_prior_workbook":true,"window_months":7,"window_start_offset":-1,"target_growth_pct":null}'::jsonb)
ON CONFLICT (property_id) DO UPDATE SET room_count = EXCLUDED.room_count,
  default_source_type = EXCLUDED.default_source_type, report_profile = EXCLUDED.report_profile;

-- Grande Roche: canonical record ba1ee5b9 (Grand Roche Hotel)
INSERT INTO public.property_report_settings (property_id, room_count, default_source_type, report_profile)
VALUES ('ba1ee5b9-94a7-48f8-aa30-bc854573009b', 30, 'protel',
  '{"source_mode":"prior_workbook_only","year_columns":[],"compare_years":[],"source_unavailable":true,"stly_from_prior_workbook":true,"window_months":7,"window_start_offset":-1,"target_growth_pct":null}'::jsonb)
ON CONFLICT (property_id) DO UPDATE SET room_count = EXCLUDED.room_count,
  default_source_type = EXCLUDED.default_source_type, report_profile = EXCLUDED.report_profile;

-- Hotel Krige: March–February financial year, budget + prior-year comparisons
UPDATE public.property_report_settings SET room_count = 24, default_source_type = 'protel',
  report_profile = '{"source_mode":"prior_workbook_only","year_columns":["budget"],"compare_years":[2025,2024],"source_unavailable":true,"stly_from_prior_workbook":true,"window_months":12,"window_start_offset":-5,"target_growth_pct":null}'::jsonb
WHERE property_id = '75fe9714-c97d-467d-817b-e0996f8c1310';

-- Les Chambres: 15 rooms, seven-month window, +7% target
UPDATE public.property_report_settings SET room_count = 15, default_source_type = 'roomraccoon',
  report_profile = '{"source_mode":"prior_workbook_only","year_columns":["target"],"compare_years":[],"source_unavailable":true,"stly_from_prior_workbook":false,"window_months":7,"window_start_offset":-1,"target_growth_pct":7}'::jsonb
WHERE property_id = '711c1882-6609-42ed-bcef-f335fd62df1d';

-- Cheeta Plains: Protel export client
UPDATE public.property_report_settings SET default_source_type = 'protel',
  report_profile = '{"source_mode":"pms_export","year_columns":[],"compare_years":[],"source_unavailable":false,"stly_from_prior_workbook":true,"window_months":null,"window_start_offset":0,"target_growth_pct":null}'::jsonb
WHERE property_id = 'd4cf0e4b-4ee4-4856-9ca2-3e70ecc7aeeb';

-- Retire the duplicate report-only records now that their profiles live on the canonical rows
DELETE FROM public.property_report_settings
WHERE property_id IN ('583e3a4a-46ae-4fe0-b1cb-53899217f9bb', '3ed47272-3ae8-4351-ac3a-1729c0762ecb', 'bdcc9839-28dd-4934-803c-669a816061ef');

UPDATE public.properties SET is_active = false, show_on_website = false
WHERE id IN ('583e3a4a-46ae-4fe0-b1cb-53899217f9bb', '3ed47272-3ae8-4351-ac3a-1729c0762ecb', 'bdcc9839-28dd-4934-803c-669a816061ef');