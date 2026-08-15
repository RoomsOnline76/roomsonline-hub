-- Company details only count when Push_FillCompanyDetails_RQ ran with the
-- sub-account's own verified credentials. Clear records that never met that bar.
UPDATE public.ru_owner_accounts a
SET company_details_sent = false,
    company_details_status = 'pending',
    company_filled_at = NULL,
    updated_at = now()
WHERE (
        lower(coalesce(a.company_details_status, '')) NOT IN ('sent', 'already_set')
        OR a.company_filled_at IS NULL
        OR a.company_filled_at < (
             SELECT c.verified_at - interval '60 seconds'
             FROM public.ru_api_credentials c
             WHERE c.ru_owner_id = a.ru_owner_id::text
             LIMIT 1
           )
        OR NOT EXISTS (
             SELECT 1 FROM public.ru_api_credentials c
             WHERE c.ru_owner_id = a.ru_owner_id::text AND c.verified_at IS NOT NULL
           )
      )
  AND (a.company_details_sent = true OR a.company_filled_at IS NOT NULL);