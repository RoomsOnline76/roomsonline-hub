-- Capture a read-only ARI pricing fixture for one property.
--
-- Usage (psql, read-only role is enough):
--   psql -At -v pid="'<property-uuid>'" -f scripts/capture-ari-fixtures.sql \
--     > supabase/functions/_shared/__fixtures__/ari/<slug>.input.json
--
-- The output is a PricingInputs-shaped snapshot consumed by
-- supabase/functions/_shared/ariSnapshot.test.ts. Nothing is written to the
-- database by this script.
select json_build_object(
  'property_id', p.id,
  'name', p.name,
  'seasons', coalesce(p.amenities -> 'seasons', '[]'::jsonb),
  'season_rates', coalesce(p.amenities -> 'season_rates', '{}'::jsonb),
  'units', (
    select coalesce(
      json_agg(
        json_build_object(
          'id', r.id,
          'name', r.name,
          'linked_rolos_id', r.linked_rolos_id,
          'daily_rate', r.daily_rate
        )
        order by r.name
      ),
      '[]'::json
    )
    from hostfully_room_types r
    where r.property_id = p.id
      and coalesce(r.is_active, true)
  ),
  'rate_plans', (
    select coalesce(
      json_agg(
        json_build_object(
          'rate_plan_id', rp.id,
          'name', rp.name,
          'base_rate', rp.base_rate,
          'pricing_model', rp.pricing_model,
          'is_active', rp.is_active,
          'min_stay', rp.min_stay,
          'max_stay', rp.max_stay
        )
        order by rp.name
      ),
      '[]'::json
    )
    from rolos_rate_plans rp
    where rp.property_id = p.id
  )
)
from properties p
where p.id = :pid::uuid;
