CREATE OR REPLACE FUNCTION public.ru_api_log_facets(_days integer DEFAULT 7)
RETURNS TABLE (kind text, value text, count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz := CASE WHEN COALESCE(_days, 0) > 0 THEN now() - make_interval(days => _days) ELSE NULL END;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'fearless_leader')
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT l.action, l.parent_action, l.ru_owner_id, l.direction
    FROM public.ru_api_log l
    WHERE _since IS NULL OR l.created_at >= _since
  )
  SELECT 'action'::text, s.action, count(*) FROM scoped s WHERE s.action IS NOT NULL AND s.action <> '' GROUP BY s.action
  UNION ALL
  SELECT 'operation'::text, split_part(s.parent_action, ':', 1), count(*) FROM scoped s
    WHERE s.parent_action IS NOT NULL AND s.parent_action <> '' GROUP BY split_part(s.parent_action, ':', 1)
  UNION ALL
  SELECT 'owner'::text, s.ru_owner_id, count(*) FROM scoped s WHERE s.ru_owner_id IS NOT NULL AND s.ru_owner_id <> '' GROUP BY s.ru_owner_id
  UNION ALL
  SELECT 'direction'::text, s.direction, count(*) FROM scoped s WHERE s.direction IS NOT NULL AND s.direction <> '' GROUP BY s.direction;
END;
$$;

REVOKE ALL ON FUNCTION public.ru_api_log_facets(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ru_api_log_facets(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ru_api_log_facets(integer) TO service_role;