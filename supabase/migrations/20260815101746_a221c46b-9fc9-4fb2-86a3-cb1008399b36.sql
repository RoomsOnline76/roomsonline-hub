UPDATE public.ru_owner_accounts a
SET ru_api_access_key = COALESCE(a.ru_api_access_key, c.access_key),
    ru_api_secret_enc = COALESCE(a.ru_api_secret_enc, c.secret_enc),
    ru_api_keys_verified_at = COALESCE(a.ru_api_keys_verified_at, c.verified_at),
    company_details_sent = true,
    company_filled_at = COALESCE(a.company_filled_at, c.verified_at),
    company_details_status = CASE WHEN a.company_details_status = 'pending' THEN 'credentials_verified' ELSE a.company_details_status END,
    updated_at = now()
FROM public.ru_api_credentials c
WHERE c.ru_owner_id = a.ru_owner_id
  AND c.access_key IS NOT NULL
  AND c.verified_at IS NOT NULL
  AND a.company_details_sent IS NOT TRUE;