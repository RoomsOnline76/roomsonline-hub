
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS hyperguest_hotel_id text,
  ADD COLUMN IF NOT EXISTS hyperguest_environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS hyperguest_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hyperguest_last_static_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS hyperguest_last_push_at timestamptz,
  ADD COLUMN IF NOT EXISTS hyperguest_last_pull_at timestamptz;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_hyperguest_environment_check;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_hyperguest_environment_check
  CHECK (hyperguest_environment IN ('sandbox','production'));

CREATE INDEX IF NOT EXISTS idx_properties_hyperguest_enabled
  ON public.properties (hyperguest_hotel_id)
  WHERE hyperguest_enabled = true;
