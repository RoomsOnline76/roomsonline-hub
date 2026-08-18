UPDATE public.ru_readiness_snapshots
SET groups = groups - 'worst_window'
WHERE groups ? 'worst_window'
  AND coalesce((groups->'worst_window'->>'open_days')::numeric, 0) = 0
  AND coalesce((groups->'worst_window'->>'longest_run')::numeric, 0) = 0;