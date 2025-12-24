-- Update public_properties view to include navigation_tags
DROP VIEW IF EXISTS public_properties;

CREATE VIEW public_properties AS
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
    updated_at,
    navigation_tags
FROM properties
WHERE is_active = true AND permanently_deleted_at IS NULL;