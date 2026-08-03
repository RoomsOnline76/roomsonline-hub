CREATE TABLE IF NOT EXISTS public.ru_location_currency_scope (
  location_id BIGINT NOT NULL,
  owner_scope TEXT NOT NULL,
  currency_iso TEXT,
  currency_ru_id INTEGER,
  source TEXT NOT NULL DEFAULT 'unverified',
  verified_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, owner_scope)
);

GRANT SELECT ON public.ru_location_currency_scope TO authenticated;
GRANT ALL ON public.ru_location_currency_scope TO service_role;

ALTER TABLE public.ru_location_currency_scope ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can view RU location currency scopes"
ON public.ru_location_currency_scope
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);

ALTER TABLE public.ru_currency_state
  ADD COLUMN IF NOT EXISTS ru_reported_currency_iso TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_ru_property_id BIGINT,
  ADD COLUMN IF NOT EXISTS owner_scope TEXT;