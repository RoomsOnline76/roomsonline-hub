ALTER TABLE public.ru_api_log
  ADD COLUMN IF NOT EXISTS transport_status text,
  ADD COLUMN IF NOT EXISTS error_reason text,
  ADD COLUMN IF NOT EXISTS changed_fields text[],
  ADD COLUMN IF NOT EXISTS push_type text,
  ADD COLUMN IF NOT EXISTS fingerprint text;

CREATE INDEX IF NOT EXISTS ru_api_log_transport_status_idx ON public.ru_api_log (transport_status, created_at DESC);
CREATE INDEX IF NOT EXISTS ru_api_log_push_type_idx ON public.ru_api_log (push_type, created_at DESC);

-- Backfill historical rows so audit queries never see a silent null response.
UPDATE public.ru_api_log
SET transport_status = 'rate_deferred',
    error_reason = COALESCE(error_reason, 'channel_rate_limit: pre-flight rate gate refused the call; request was never sent')
WHERE transport_status IS NULL
  AND response_xml IS NULL
  AND (http_status = 429 OR error_message ILIKE '%RU_RATE_DEFERRED%');

UPDATE public.ru_api_log
SET transport_status = 'completed'
WHERE transport_status IS NULL AND response_xml IS NOT NULL;

UPDATE public.ru_api_log
SET transport_status = 'transport_error',
    error_reason = COALESCE(error_reason, COALESCE(LEFT(error_message, 200), 'unlabelled_pre_upgrade_failure'))
WHERE transport_status IS NULL;

ALTER TABLE public.ru_api_log ALTER COLUMN transport_status SET DEFAULT 'completed';