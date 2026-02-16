
-- Ensure only one payment gateway can be active at a time
-- When activating a payment system, deactivate all other payment systems
CREATE OR REPLACE FUNCTION public.enforce_single_active_payment_gateway()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only act when a payment system is being set to active
  IF NEW.category = 'payment' AND NEW.is_active = true AND (OLD.is_active = false OR OLD.is_active IS NULL) THEN
    -- Deactivate all other payment systems
    UPDATE supporting_systems
    SET is_active = false
    WHERE category = 'payment'
      AND id != NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_single_active_payment_gateway
BEFORE UPDATE ON public.supporting_systems
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_active_payment_gateway();
