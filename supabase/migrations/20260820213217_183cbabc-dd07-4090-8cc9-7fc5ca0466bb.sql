CREATE OR REPLACE FUNCTION public.ru_push_gate_status(_property_id uuid)
RETURNS TABLE (section text, last_called_at timestamptz, wait_seconds integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    SELECT (public.can_access_channel_property(_property_id, auth.uid())
        OR public.has_role(auth.uid(), 'fearless_leader')) AS ok
  ),
  pushes AS (
    SELECT CASE
             WHEN l.action IN ('Push_PutPrices_RQ', 'Push_PutAvbUnits_RQ') THEN 'rates'
             ELSE 'content'
           END AS section,
           l.created_at
    FROM public.ru_api_log l, allowed a
    WHERE a.ok
      AND l.property_id = _property_id
      AND l.direction = 'outbound'
      AND l.action IN ('Push_PutProperty_RQ', 'Push_PutPrices_RQ', 'Push_PutAvbUnits_RQ')
      AND l.created_at > now() - interval '5 minutes'
  )
  SELECT p.section,
         max(p.created_at) AS last_called_at,
         GREATEST(0, 60 - floor(EXTRACT(EPOCH FROM (now() - max(p.created_at))))::int) AS wait_seconds
  FROM pushes p
  GROUP BY p.section
$$;

REVOKE ALL ON FUNCTION public.ru_push_gate_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ru_push_gate_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ru_push_gate_status(uuid) TO service_role;