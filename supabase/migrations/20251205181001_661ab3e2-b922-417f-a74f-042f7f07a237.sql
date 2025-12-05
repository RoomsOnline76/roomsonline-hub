-- Fix Security Definer View by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_properties;

CREATE VIEW public.public_properties
WITH (security_invoker = true) AS
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
    images,
    bathrooms,
    bedrooms,
    max_guests,
    price_per_night,
    slug,
    amenities,
    property_url,
    is_active,
    benson_property_code,
    checkfront_property_code,
    siteminder_property_code,
    external_system,
    external_id,
    created_at,
    updated_at
FROM properties
WHERE is_active = true AND permanently_deleted_at IS NULL;

-- Grant access to the view for anon and authenticated roles
GRANT SELECT ON public.public_properties TO anon;
GRANT SELECT ON public.public_properties TO authenticated;