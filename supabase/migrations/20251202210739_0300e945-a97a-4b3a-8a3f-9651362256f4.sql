-- Drop the restrictive policy and create a permissive one
DROP POLICY IF EXISTS "Anyone can view google maps api key" ON public.api_keys;

-- Create a PERMISSIVE policy for public access to Google Maps API key
CREATE POLICY "Public can view google maps api key"
ON public.api_keys
FOR SELECT
TO public
USING (key_name = 'google_maps_api_key');