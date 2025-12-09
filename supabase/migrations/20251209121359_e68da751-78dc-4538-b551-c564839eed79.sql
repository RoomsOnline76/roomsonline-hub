-- Fix 1: Recreate public_properties view with SECURITY INVOKER (explicit)
-- This makes the view respect RLS of the querying user
DROP VIEW IF EXISTS public.public_properties;

CREATE VIEW public.public_properties 
WITH (security_invoker = true)
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
FROM properties
WHERE is_active = true AND permanently_deleted_at IS NULL;

-- Grant access to the view
GRANT SELECT ON public.public_properties TO anon, authenticated;

-- Fix 2: Recreate public_nightsbridge_config with SECURITY INVOKER
DROP VIEW IF EXISTS public.public_nightsbridge_config;

CREATE VIEW public.public_nightsbridge_config
WITH (security_invoker = true)
AS
SELECT agent_code
FROM pms_credentials
WHERE system_type = 'nightsbridge' AND is_active = true
LIMIT 1;

-- Grant access to the view
GRANT SELECT ON public.public_nightsbridge_config TO anon, authenticated;

-- Fix 3: Remove the overly permissive email-based booking lookup policy
-- Keep only user_id based access for authenticated users
DROP POLICY IF EXISTS "Users can view bookings by email" ON public.bookings;

-- Create a more secure policy that allows viewing by user_id OR 
-- allows admins/devs to view all bookings for management
CREATE POLICY "Admins and devs can view all bookings" 
ON public.bookings 
FOR SELECT 
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- Property owners can view bookings for their properties
CREATE POLICY "Owners can view bookings for their properties"
ON public.bookings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id = bookings.property_id AND pr.id = auth.uid()
  )
);