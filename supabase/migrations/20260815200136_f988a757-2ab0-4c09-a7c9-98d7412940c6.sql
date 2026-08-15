ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ru_listings_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS ru_listings_verified_owner text,
  ADD COLUMN IF NOT EXISTS ru_listings_verified_units integer,
  ADD COLUMN IF NOT EXISTS ru_listings_expected_units integer,
  ADD COLUMN IF NOT EXISTS ru_listings_unmatched jsonb NOT NULL DEFAULT '[]'::jsonb;