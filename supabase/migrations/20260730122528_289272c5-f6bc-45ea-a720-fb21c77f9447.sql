CREATE TABLE public.ru_platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ru_platform_settings TO authenticated;
GRANT ALL ON public.ru_platform_settings TO service_role;

ALTER TABLE public.ru_platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read RU platform settings"
ON public.ru_platform_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);

INSERT INTO public.ru_platform_settings (key, value)
VALUES ('user_management', '{"enabled": false, "note": "Parked — awaiting Rentals United confirmation of the ROLOS PMS profile."}'::jsonb);