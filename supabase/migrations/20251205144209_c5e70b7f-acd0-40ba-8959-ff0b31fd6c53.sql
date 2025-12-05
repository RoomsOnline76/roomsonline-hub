-- Create a public view that excludes sensitive owner information
CREATE OR REPLACE VIEW public.public_properties AS
SELECT 
  id, name, description, property_type, address, city, country,
  latitude, longitude, images, bathrooms, bedrooms, max_guests,
  price_per_night, slug, amenities, property_url, is_active,
  benson_property_code, checkfront_property_code, siteminder_property_code,
  external_system, external_id, created_at, updated_at
FROM properties
WHERE is_active = true AND permanently_deleted_at IS NULL;

-- Drop the problematic public policy that exposes owner emails
DROP POLICY IF EXISTS "Anyone can view active properties" ON public.properties;

-- Grant select on the public view to anon and authenticated users
GRANT SELECT ON public.public_properties TO anon;
GRANT SELECT ON public.public_properties TO authenticated;