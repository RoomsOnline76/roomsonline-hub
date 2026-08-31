CREATE OR REPLACE FUNCTION public.purge_ru_call_queue_terminal(_statuses text[] DEFAULT ARRAY['failed','no_op','superseded','completed','done'], _older_than_minutes integer DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorised to purge the channel call queue';
  END IF;

  -- Only terminal states may be purged: live work (pending/claimed) must never be dropped.
  IF EXISTS (SELECT 1 FROM unnest(_statuses) s WHERE s NOT IN ('failed','no_op','superseded','completed','done')) THEN
    RAISE EXCEPTION 'Only terminal queue states can be purged';
  END IF;

  DELETE FROM public.ru_call_queue
  WHERE status = ANY(_statuses)
    AND created_at < now() - make_interval(mins => GREATEST(_older_than_minutes, 0));

  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_ru_call_queue_terminal(text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_ru_call_queue_terminal(text[], integer) TO authenticated;