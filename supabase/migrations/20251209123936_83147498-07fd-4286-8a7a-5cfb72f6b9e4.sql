-- Fix: Property owner email exposure
-- The public_properties view should use SECURITY DEFINER (security_invoker = false) 
-- to bypass RLS while restricting columns. Then we remove the public SELECT policy
-- from the properties table so direct queries are blocked.

-- Step 1: Recreate public_properties view with SECURITY DEFINER (security_invoker = false)
-- This allows the view to bypass RLS while only exposing safe columns
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
FROM properties
WHERE is_active = true AND permanently_deleted_at IS NULL;

-- Grant SELECT on the view to anon and authenticated
GRANT SELECT ON public.public_properties TO anon, authenticated;

-- Step 2: Remove the overly permissive public SELECT policy from properties table
-- This prevents anonymous users from directly querying the properties table
DROP POLICY IF EXISTS "Public can view active properties" ON public.properties;

-- Note: Admins, devs, and owners still have their own SELECT policies,
-- so they can access the full properties table including owner_email