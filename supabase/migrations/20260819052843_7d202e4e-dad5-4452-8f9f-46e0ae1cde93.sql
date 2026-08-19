INSERT INTO public.ru_platform_settings (key, value)
VALUES ('channel_step_ledger_enabled', '{"enabled": false, "note": "Channel step ledger rollout flag — Phase 0, off by default."}'::jsonb)
ON CONFLICT (key) DO NOTHING;