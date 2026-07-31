UPDATE public.ru_owner_accounts
SET company_details_sent = false,
    company_filled_at = NULL,
    company_details_status = 'credentials_failed'
WHERE ru_owner_id = '741761';