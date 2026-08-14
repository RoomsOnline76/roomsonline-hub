CREATE TABLE public.ru_method_rate_limits (
  method_key text PRIMARY KEY,
  action text,
  last_called_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ru_method_rate_limits TO service_role;

ALTER TABLE public.ru_method_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ru_method_rate_limits_last_called ON public.ru_method_rate_limits (last_called_at DESC);

CREATE OR REPLACE FUNCTION public.ru_claim_rate_slot(_method_key text, _action text, _window_seconds integer)
RETURNS TABLE (granted boolean, wait_ms integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := clock_timestamp();
  _prev timestamptz;
BEGIN
  INSERT INTO public.ru_method_rate_limits (method_key, action, last_called_at)
  VALUES (_method_key, _action, _now)
  ON CONFLICT (method_key) DO UPDATE
    SET last_called_at = _now,
        action = COALESCE(EXCLUDED.action, public.ru_method_rate_limits.action),
        updated_at = _now
    WHERE public.ru_method_rate_limits.last_called_at <= _now - make_interval(secs => _window_seconds)
  RETURNING NULL::timestamptz INTO _prev;

  IF FOUND THEN
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  SELECT r.last_called_at INTO _prev FROM public.ru_method_rate_limits r WHERE r.method_key = _method_key;
  RETURN QUERY
    SELECT false,
           GREATEST(0, CEIL(EXTRACT(EPOCH FROM ((_prev + make_interval(secs => _window_seconds)) - _now)) * 1000)::int);
END;
$$;

REVOKE ALL ON FUNCTION public.ru_claim_rate_slot(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ru_claim_rate_slot(text, text, integer) TO service_role;