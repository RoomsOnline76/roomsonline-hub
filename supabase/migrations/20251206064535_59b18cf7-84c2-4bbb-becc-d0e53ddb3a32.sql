-- Recreate public_properties view with security_invoker = false to bypass RLS
DROP VIEW IF EXISTS public.public_properties;

CREATE VIEW public.public_properties 
WITH (security_invoker = false)
AS
SELECT 
  id,
  name,
  description,
  property_type,
  address,
  city,
  country,
  latitude,
  longitude,
  max_guests,
  bedrooms,
  bathrooms,
  price_per_night,
  images,
  amenities,
  is_active,
  external_id,
  external_system,
  benson_property_code,
  checkfront_property_code,
  siteminder_property_code,
  slug,
  property_url,
  created_at,
  updated_at
FROM public.properties
WHERE is_active = true 
  AND permanently_deleted_at IS NULL;

-- Re-grant SELECT permission
GRANT SELECT ON public.public_properties TO anon;
GRANT SELECT ON public.public_properties TO authenticated;