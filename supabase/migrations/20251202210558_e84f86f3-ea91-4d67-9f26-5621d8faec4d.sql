-- Allow anyone to read the Google Maps API key (needed for public map display)
CREATE POLICY "Anyone can view google maps api key"
ON public.api_keys
FOR SELECT
USING (key_name = 'google_maps_api_key');