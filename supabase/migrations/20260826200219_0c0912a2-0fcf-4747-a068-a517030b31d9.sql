ALTER TABLE public.ru_retired_accounts
  ADD COLUMN IF NOT EXISTS channel_archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listings_archived INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel_archive_result JSONB;