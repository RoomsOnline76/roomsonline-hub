ALTER TABLE public.rolos_groups
  ADD COLUMN IF NOT EXISTS portal_token uuid,
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS rolos_groups_portal_token_key
  ON public.rolos_groups (portal_token) WHERE portal_token IS NOT NULL;