-- 1. Restrict billing_global_defaults from anon
DROP POLICY IF EXISTS "Public can view billing defaults for pricing page" ON public.billing_global_defaults;
REVOKE SELECT ON public.billing_global_defaults FROM anon;

-- Narrow public view with only display-safe columns
CREATE OR REPLACE VIEW public.public_pricing_defaults AS
SELECT
  strategy,
  tier_pricing_json,
  branding_addon_monthly_fee,
  white_label_monthly_fee,
  pricelabs_monthly_fee,
  byo_gateway_monthly_fee,
  widget_flat_commission_rate,
  default_commission_rate
FROM public.billing_global_defaults
WHERE strategy IN ('rolos_pms', 'widget');

GRANT SELECT ON public.public_pricing_defaults TO anon, authenticated;

-- 2. Revoke anon EXECUTE on internal SECURITY DEFINER helpers
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_single_master_policy() FROM anon, authenticated, public;

REVOKE ALL ON FUNCTION public.is_property_active(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_property_active(uuid) TO authenticated, service_role;