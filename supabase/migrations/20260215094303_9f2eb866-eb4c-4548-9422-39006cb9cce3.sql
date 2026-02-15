-- Add brand override columns to public_properties view
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
    brand_override_enabled,
    brand_primary_color,
    brand_secondary_color,
    brand_font_color,
    brand_logo_url,
    created_at,
    updated_at
FROM properties
WHERE is_active = true AND permanently_deleted_at IS NULL;

GRANT SELECT ON public.public_properties TO anon, authenticated;

COMMENT ON VIEW public.public_properties IS 'Public view of active properties. Includes brand override fields for property showcase customisation.';