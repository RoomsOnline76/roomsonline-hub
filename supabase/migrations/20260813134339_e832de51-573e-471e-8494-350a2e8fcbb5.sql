ALTER TABLE public.ru_notifications
  ADD COLUMN IF NOT EXISTS resolution_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS resolved_owner_id text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS ru_notifications_resolution_state_idx
  ON public.ru_notifications (resolution_state, created_at DESC);

UPDATE public.ru_notifications
   SET resolution_state = 'resolved'
 WHERE processed = true AND resolution_state = 'pending';

UPDATE public.ru_notifications
   SET resolution_state = 'unmapped'
 WHERE processed = false
   AND property_id IS NULL
   AND ru_property_id IS NOT NULL
   AND resolution_state = 'pending';

GRANT SELECT ON public.ru_notifications TO authenticated;
GRANT ALL ON public.ru_notifications TO service_role;