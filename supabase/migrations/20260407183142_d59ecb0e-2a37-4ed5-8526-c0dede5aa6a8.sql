CREATE OR REPLACE FUNCTION public.get_latest_cache_activity()
RETURNS TABLE(external_system text, latest_fetched_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.external_system::text,
    MAX(pac.fetched_at) AS latest_fetched_at
  FROM pms_availability_cache pac
  JOIN properties p ON p.id = pac.property_id
  WHERE pac.fetched_at > now() - interval '30 days'
  GROUP BY p.external_system
  ORDER BY p.external_system;
$$;