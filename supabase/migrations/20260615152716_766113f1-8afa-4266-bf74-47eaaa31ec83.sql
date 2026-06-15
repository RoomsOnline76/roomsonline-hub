ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS allow_custom_payment_provider boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.properties.allow_custom_payment_provider IS
  'Admin-controlled. When false the property uses the Rooms Online default PayFast gateway. When true the owner can configure a custom payment provider via the ROLOS Integrations page.';