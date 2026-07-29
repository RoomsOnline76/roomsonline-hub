ALTER TABLE public.integration_configs
  DROP CONSTRAINT IF EXISTS integration_configs_integration_type_check;

ALTER TABLE public.integration_configs
  ADD CONSTRAINT integration_configs_integration_type_check
  CHECK (
    integration_type = ANY (
      ARRAY[
        'direct'::text,
        'widget'::text,
        'booking_bar'::text,
        'full_embed'::text,
        'wordpress'::text,
        'api'::text,
        'payment_credentials'::text
      ]
    )
  );