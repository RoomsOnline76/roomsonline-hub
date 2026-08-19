UPDATE public.ru_platform_settings
SET value = jsonb_build_object('enabled', true)
WHERE key = 'channel_step_ledger_enabled';

INSERT INTO public.ru_platform_settings (key, value)
SELECT 'channel_step_ledger_enabled', jsonb_build_object('enabled', true)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ru_platform_settings WHERE key = 'channel_step_ledger_enabled'
);