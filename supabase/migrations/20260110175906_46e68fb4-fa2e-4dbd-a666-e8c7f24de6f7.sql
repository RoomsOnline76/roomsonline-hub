
-- Recreate public_properties view with external_system (needed for booking flow)
-- but exclude sensitive property codes
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
    external_system,
    external_id,
    created_at,
    updated_at
FROM properties
WHERE is_active = true AND permanently_deleted_at IS NULL;

-- Add comment explaining what's exposed and what's excluded
COMMENT ON VIEW public.public_properties IS 'Public view of active properties. Excludes sensitive PMS codes (benson_property_code, checkfront_property_code, siteminder_property_code) but includes external_system/external_id needed for booking flow.';
