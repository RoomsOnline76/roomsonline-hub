DROP POLICY IF EXISTS "Public can validate unexpired tokens" ON public.property_onboarding_tokens;

CREATE OR REPLACE FUNCTION public.validate_onboarding_token(_token uuid)
RETURNS TABLE (
  id uuid,
  property_id uuid,
  owner_email text,
  expires_at timestamptz,
  used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.property_id, t.owner_email, t.expires_at, t.used_at
  FROM public.property_onboarding_tokens t
  WHERE t.token = _token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_onboarding_token(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.validate_onboarding_token(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_onboarding_token(_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text;
  _hit integer;
BEGIN
  SELECT email INTO _email FROM public.profiles WHERE id = auth.uid();
  IF _email IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.property_onboarding_tokens
     SET used_at = now()
   WHERE token = _token
     AND lower(owner_email) = lower(_email)
     AND used_at IS NULL
     AND expires_at > now();

  GET DIAGNOSTICS _hit = ROW_COUNT;
  RETURN _hit > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_onboarding_token(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_onboarding_token(uuid) TO authenticated, service_role;