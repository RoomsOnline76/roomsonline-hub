CREATE OR REPLACE FUNCTION public.decrypt_sensitive_text(encrypted_data bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  request_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF encrypted_data IS NULL THEN
    RETURN NULL;
  END IF;

  IF request_role <> 'service_role'
     AND NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')) THEN
    RETURN '[ENCRYPTED]';
  END IF;

  RETURN extensions.pgp_sym_decrypt(encrypted_data, public.get_booking_encryption_key());
EXCEPTION
  WHEN OTHERS THEN
    RETURN '[DECRYPTION_ERROR]';
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_sensitive_text(bytea) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrypt_sensitive_text(bytea) TO authenticated, service_role;