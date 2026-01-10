
-- Recreate public_properties view to exclude sensitive PMS integration fields
DROP VIEW IF EXISTS public.public_properties;

CREATE VIEW public.public_properties AS
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
    slug,
    property_url,
    navigation_tags,
    hero_listing,
    created_at,
    updated_at
FROM properties
WHERE is_active = true AND permanently_deleted_at IS NULL;

-- Add comment explaining the security consideration
COMMENT ON VIEW public.public_properties IS 'Public view of properties with sensitive PMS integration fields (external_id, external_system, property_codes) excluded for security';
