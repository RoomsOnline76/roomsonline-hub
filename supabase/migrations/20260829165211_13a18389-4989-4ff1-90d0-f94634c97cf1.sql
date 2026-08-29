insert into public.properties (name, slug, property_type, address, city, country, price_per_night, is_active, show_on_website)
values ('Grande Roche', 'grande-roche', 'reporting_client', 'Plantasie Street, Paarl', 'Paarl', 'South Africa', 0, false, false)
on conflict do nothing;

insert into public.property_report_settings (property_id, room_count, default_source_type, report_profile)
select id, 30, 'protel',
  jsonb_build_object(
    'source_mode', 'prior_workbook_only',
    'source_unavailable', true,
    'stly_from_prior_workbook', true,
    'compare_years', '[]'::jsonb,
    'year_columns', '[]'::jsonb
  )
from public.properties where slug = 'grande-roche'
on conflict (property_id) do update
  set room_count = excluded.room_count,
      default_source_type = excluded.default_source_type,
      report_profile = excluded.report_profile;