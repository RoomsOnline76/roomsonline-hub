UPDATE public.ru_owner_accounts
SET ru_api_access_key = NULL,
    ru_api_secret_enc = NULL,
    ru_api_key_label = NULL,
    ru_api_keys_verified_at = NULL,
    company_details_sent = false,
    company_details_status = 'credentials_cleared',
    company_filled_at = NULL
WHERE id = '40adaff1-b8c8-4bcf-9d52-9f86daca7ffa';