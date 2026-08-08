-- Payment handling mode: rol (ROL gateway) | byo (own gateway) | reservation_only (no online payment)
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'rol';

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_payment_mode_check;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_payment_mode_check
  CHECK (payment_mode IN ('rol','byo','reservation_only'));

UPDATE public.properties
   SET payment_mode = 'byo'
 WHERE COALESCE(allow_custom_payment_provider, false) = true
   AND payment_mode = 'rol';

ALTER TABLE public.portfolio_payment_configs
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'rol';

ALTER TABLE public.portfolio_payment_configs
  DROP CONSTRAINT IF EXISTS portfolio_payment_configs_payment_mode_check;
ALTER TABLE public.portfolio_payment_configs
  ADD CONSTRAINT portfolio_payment_configs_payment_mode_check
  CHECK (payment_mode IN ('rol','byo','reservation_only'));

UPDATE public.portfolio_payment_configs
   SET payment_mode = 'byo'
 WHERE COALESCE(allow_custom_payment_provider, false) = true
   AND payment_mode = 'rol';

-- Reservation-only holds on bookings (hold_expires_at / hold_released_at already exist)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reservation_hold boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS bookings_reservation_hold_idx
  ON public.bookings (reservation_hold, hold_expires_at)
  WHERE reservation_hold = true;

-- Propagate payment_mode portfolio-wide alongside the existing provider sync
CREATE OR REPLACE FUNCTION public.sync_portfolio_payment_config(_portfolio_id uuid, _property_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.portfolio_payment_configs%ROWTYPE;
  prop RECORD;
BEGIN
  SELECT * INTO cfg FROM public.portfolio_payment_configs WHERE portfolio_id = _portfolio_id;
  IF NOT FOUND THEN RETURN; END IF;

  FOR prop IN
    SELECT p.id
    FROM public.properties p
    JOIN public.property_portfolio_members m ON m.property_id = p.id
    WHERE m.portfolio_id = _portfolio_id
      AND COALESCE(p.payment_provider_override, false) = false
      AND (_property_id IS NULL OR p.id = _property_id)
  LOOP
    UPDATE public.properties
       SET allow_custom_payment_provider = cfg.allow_custom_payment_provider,
           payment_providers = cfg.payment_providers,
           payment_provider = COALESCE(cfg.payment_providers[1], payment_provider),
           payment_mode = COALESCE(cfg.payment_mode, payment_mode)
     WHERE id = prop.id;

    IF cfg.allow_custom_payment_provider AND cfg.credentials <> '{}'::jsonb THEN
      IF EXISTS (
        SELECT 1 FROM public.integration_configs
        WHERE property_id = prop.id AND integration_type = 'payment_credentials'
      ) THEN
        UPDATE public.integration_configs
           SET config = cfg.credentials, is_active = true
         WHERE property_id = prop.id AND integration_type = 'payment_credentials';
      ELSE
        INSERT INTO public.integration_configs (property_id, integration_type, config, is_active)
        VALUES (prop.id, 'payment_credentials', cfg.credentials, true);
      END IF;
    END IF;
  END LOOP;
END;
$function$;