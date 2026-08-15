ALTER TABLE public.ru_readiness_snapshots
  ADD COLUMN IF NOT EXISTS phase_payload jsonb,
  ADD COLUMN IF NOT EXISTS phase_payload_at timestamptz;