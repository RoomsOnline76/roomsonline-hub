-- 1. Register live properties in the Channel Manager connections list.
INSERT INTO public.rolos_channel_connections (property_id, channel_name, status, settings)
SELECT DISTINCT p.id, 'rentals_united'::public.channel_name, 'active'::public.channel_connection_status,
       jsonb_build_object('auto_confirm', true, 'sync_interval_minutes', 30, 'registered_by', 'channel_onboarding_backfill')
FROM public.properties p
WHERE p.ru_push_enabled IS TRUE
  AND COALESCE(p.ru_archived, false) IS FALSE
  AND (
    p.rentalsunited_property_id IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.hostfully_room_types rt
      WHERE rt.property_id = p.id AND rt.is_active AND rt.rentalsunited_property_id IS NOT NULL
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.rolos_channel_connections c
    WHERE c.property_id = p.id AND c.channel_name = 'rentals_united'::public.channel_name
  );

-- 2. Stamp the channel-side onboarding ledger steps that a completed Step B already proved.
INSERT INTO public.property_channel_step_status
  (property_id, step_key, status, blocker_summary, source, passed_at, last_checked_at, details)
SELECT s.property_id, k.step_key, 'passed', NULL, 'push_result', now(), now(),
       jsonb_build_object('backfill', 'Proved by a passed Step B push')
FROM public.property_channel_step_status s
CROSS JOIN (VALUES ('publish'), ('currency'), ('entitlement'), ('connect')) AS k(step_key)
WHERE s.step_key = 'monitor_step_b' AND s.status = 'passed'
ON CONFLICT (property_id, step_key) DO UPDATE
  SET status = 'passed',
      blocker_summary = NULL,
      passed_at = COALESCE(public.property_channel_step_status.passed_at, now()),
      stale_at = NULL,
      last_checked_at = now(),
      updated_at = now();