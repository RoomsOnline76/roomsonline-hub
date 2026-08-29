-- Reporting-only records for the Jembisa group
insert into public.properties (name, address, city, country, is_reports_client, is_active, show_on_website, ru_push_enabled, property_type, price_per_night)
select v.name, v.city, v.city, 'South Africa', true, false, false, false, 'reporting_client', 0
from (values
  ('Jembisa Bush Home', 'Vaalwater'),
  ('Magari Safari Lodge', 'Vaalwater'),
  ('Palala River Cottages', 'Vaalwater')
) as v(name, city)
where not exists (select 1 from public.properties p where p.name = v.name);

-- Report settings for every outstanding client
with cfg(name, rooms, profile) as (
  values
    ('55 on Main', 15, '{"compare_years":[],"stly_from_prior_workbook":false,"source_unavailable":false,"source_mode":"pms_export","year_columns":["target"],"window_months":7,"window_start_offset":-1,"target_growth_pct":10}'::jsonb),
    ('Ashbourne House Guest House', 8, '{"compare_years":[],"stly_from_prior_workbook":false,"source_unavailable":false,"source_mode":"pms_export","year_columns":["target"],"window_months":7,"window_start_offset":-1,"target_growth_pct":10}'::jsonb),
    ('Kunjani Villas', 8, '{"compare_years":[],"stly_from_prior_workbook":false,"source_unavailable":false,"source_mode":"pms_export","year_columns":["target"],"window_months":7,"window_start_offset":-1,"target_growth_pct":10}'::jsonb),
    ('Schoone Oordt Country House', 11, '{"compare_years":[],"stly_from_prior_workbook":false,"source_unavailable":true,"source_mode":"prior_workbook_only","year_columns":["target"],"window_months":7,"window_start_offset":-1,"target_growth_pct":10}'::jsonb),
    ('Explorers Club', 6, '{"compare_years":[],"stly_from_prior_workbook":false,"source_unavailable":false,"source_mode":"pms_export","year_columns":[],"window_months":12,"window_start_offset":-5,"target_growth_pct":null}'::jsonb),
    ('Willow Point Country Estate', 1, '{"compare_years":[],"stly_from_prior_workbook":false,"source_unavailable":false,"source_mode":"pms_export","year_columns":[],"window_months":12,"window_start_offset":-5,"target_growth_pct":null}'::jsonb),
    ('Jembisa Bush Home', 7, '{"compare_years":[],"stly_from_prior_workbook":false,"source_unavailable":false,"source_mode":"pms_export","year_columns":["target"],"window_months":12,"window_start_offset":-5,"target_growth_pct":7}'::jsonb),
    ('Magari Safari Lodge', 6, '{"compare_years":[],"stly_from_prior_workbook":false,"source_unavailable":false,"source_mode":"pms_export","year_columns":["target"],"window_months":12,"window_start_offset":-5,"target_growth_pct":7}'::jsonb),
    ('Palala River Cottages', 6, '{"compare_years":[],"stly_from_prior_workbook":false,"source_unavailable":false,"source_mode":"pms_export","year_columns":["target"],"window_months":12,"window_start_offset":-5,"target_growth_pct":7}'::jsonb)
)
insert into public.property_report_settings (property_id, room_count, brand_source, default_source_type, report_profile, historical_baseline)
select p.id, cfg.rooms, 'custom', 'nightsbridge', cfg.profile, '{}'::jsonb
from cfg
join public.properties p on p.name = cfg.name
where p.is_active = true or p.is_reports_client = true
on conflict (property_id) do update
  set room_count = excluded.room_count,
      default_source_type = excluded.default_source_type,
      report_profile = excluded.report_profile;

-- Mziki: printed pack is built on 8 sellable rooms, and keeps its STLY comparison
update public.property_report_settings s
set room_count = 8,
    report_profile = '{"compare_years":[],"stly_from_prior_workbook":true,"source_unavailable":false,"source_mode":"pms_export","year_columns":["target"],"window_months":7,"window_start_offset":-1,"target_growth_pct":10}'::jsonb
from public.properties p
where p.id = s.property_id and p.name = 'Mziki Safari Lodge' and p.is_active = true;