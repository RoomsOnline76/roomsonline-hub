-- ============================================================================
-- verify-rate-compat.sql
-- Read-only proof that the unified Rate Plans schema change (Phase 2) left all
-- pre-existing rate data readable exactly as before.
--
-- Run:  psql -f scripts/verify-rate-compat.sql
-- Every check must report PASS.
-- ============================================================================

\echo '== 1. Baseline row visibility (expected: 42 plans, 65 links, 3 seasons, 0 prices) =='
SELECT 'rolos_rate_plans'            AS table_name, count(*) AS total,
       count(*) FILTER (WHERE deleted_at IS NULL) AS visible_to_legacy_readers
  FROM public.rolos_rate_plans
UNION ALL
SELECT 'rolos_rate_plan_room_types', count(*),
       count(*) FILTER (WHERE deleted_at IS NULL AND is_active)
  FROM public.rolos_rate_plan_room_types
UNION ALL
SELECT 'rolos_rate_seasons', count(*), count(*)
  FROM public.rolos_rate_seasons
UNION ALL
SELECT 'rolos_rate_prices', count(*),
       count(*) FILTER (WHERE deleted_at IS NULL AND is_active)
  FROM public.rolos_rate_prices;

\echo '== 2. No existing row was hidden by the new soft-delete / is_active flags =='
SELECT CASE
  WHEN (SELECT count(*) FROM public.rolos_rate_plans WHERE deleted_at IS NOT NULL) = 0
   AND (SELECT count(*) FROM public.rolos_rate_plan_room_types WHERE deleted_at IS NOT NULL OR is_active = false) = 0
   AND (SELECT count(*) FROM public.rolos_rate_prices WHERE deleted_at IS NOT NULL OR is_active = false) = 0
  THEN 'PASS' ELSE 'FAIL' END AS no_rows_hidden;

\echo '== 3. Every new column is nullable or has a default (no insert can start failing) =='
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS new_columns_safe,
       coalesce(string_agg(table_name || '.' || column_name, ', '), 'none') AS offending
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('rolos_rate_plans', 'rolos_rate_plan_room_types', 'rolos_rate_prices')
   AND column_name IN ('deleted_at','portfolio_id','plan_scope','is_active','differential_type','differential_value','sort_order')
   AND is_nullable = 'NO'
   AND column_default IS NULL;

\echo '== 4. New tables exist, are empty, and have RLS enabled with policies =='
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policy_count,
       CASE c.relname
         WHEN 'rolos_shared_seasons' THEN (SELECT count(*) FROM public.rolos_shared_seasons)
         WHEN 'rolos_rate_plan_season_rates' THEN (SELECT count(*) FROM public.rolos_rate_plan_season_rates)
       END AS row_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('rolos_shared_seasons','rolos_rate_plan_season_rates');

\echo '== 5. Compatibility view returns exactly the legacy price projection =='
-- With the new table empty the view must equal rolos_rate_prices, row for row.
WITH legacy AS (
  SELECT season_id, room_type_id, base_rate, extra_adult_rate, extra_child_rate
    FROM public.rolos_rate_prices
   WHERE deleted_at IS NULL AND is_active
), view_rows AS (
  SELECT season_id, room_type_id, base_rate, extra_adult_rate, extra_child_rate
    FROM public.rolos_v_rate_plan_season_prices
)
SELECT CASE
  WHEN (SELECT count(*) FROM (SELECT * FROM legacy EXCEPT SELECT * FROM view_rows) d) = 0
   AND (SELECT count(*) FROM (SELECT * FROM view_rows EXCEPT SELECT * FROM legacy) d) = 0
  THEN 'PASS' ELSE 'FAIL' END AS view_matches_legacy;

\echo '== 6. Compatibility view is security_invoker (RLS still applies to callers) =='
SELECT CASE WHEN 'security_invoker=true' = ANY (c.reloptions)
            OR 'security_invoker=on' = ANY (c.reloptions)
       THEN 'PASS' ELSE 'FAIL' END AS view_security_invoker
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname = 'rolos_v_rate_plan_season_prices';

\echo '== 7. Kill switch untouched: every property still resolves rates the legacy way =='
SELECT coalesce(rate_resolution_mode, 'legacy') AS mode, count(*) AS properties
  FROM public.properties
 GROUP BY 1
 ORDER BY 1;

\echo '== 8. Indexes booking / ARI rely on are present =='
SELECT indexname
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND indexname IN (
     'idx_rate_plan_room_types_room_type',
     'idx_rolos_rate_plans_property_active',
     'idx_rolos_rate_prices_room_type',
     'idx_rate_plan_season_rates_plan_legacy',
     'idx_rate_plan_season_rates_plan_shared',
     'idx_rate_plan_season_rates_room_type',
     'uq_rate_plan_season_rates_key',
     'idx_shared_seasons_portfolio_dates',
     'idx_shared_seasons_property_dates'
   )
 ORDER BY 1;

\echo '== 9. Legacy reader query shapes still execute unchanged =='
-- Mirrors _shared/rateResolution.ts rack-rate + link lookup.
SELECT count(*) AS resolver_link_rows
  FROM public.rolos_rate_plan_room_types l
  JOIN public.rolos_rate_plans p ON p.id = l.rate_plan_id AND p.is_active = true;

-- Mirrors modify-booking's season price lookup.
SELECT count(*) AS modify_booking_season_price_rows
  FROM public.rolos_rate_prices pr
  JOIN public.rolos_rate_seasons s ON s.id = pr.season_id;

\echo '== 10. Calendar remains the season owner (JSONB seasons still populated) =='
SELECT count(*) AS properties_with_calendar_seasons
  FROM public.properties
 WHERE jsonb_typeof(amenities -> 'seasons') = 'array'
   AND jsonb_array_length(amenities -> 'seasons') > 0;
