CREATE TABLE public.ru_api_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ru_owner_id text NOT NULL UNIQUE,
  login_email text,
  access_key text NOT NULL,
  secret_enc bytea,
  key_label text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ru_api_credentials TO authenticated;
GRANT ALL ON public.ru_api_credentials TO service_role;

ALTER TABLE public.ru_api_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage RU API credentials"
ON public.ru_api_credentials
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);

CREATE TRIGGER update_ru_api_credentials_updated_at
BEFORE UPDATE ON public.ru_api_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ru_api_credentials (ru_owner_id, login_email, access_key, secret_enc, key_label, verified_at)
SELECT DISTINCT ON (ru_owner_id)
  ru_owner_id,
  COALESCE(ru_login_email, owner_email),
  ru_api_access_key,
  ru_api_secret_enc,
  ru_api_key_label,
  ru_api_keys_verified_at
FROM public.ru_owner_accounts
WHERE ru_owner_id IS NOT NULL AND ru_api_access_key IS NOT NULL
ORDER BY ru_owner_id, ru_api_keys_verified_at DESC NULLS LAST
ON CONFLICT (ru_owner_id) DO NOTHING;