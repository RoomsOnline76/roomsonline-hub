-- The same AccessKey was stored for RU OwnerIDs 741761 and 741765; keep the pair on the
-- account it was minted for (741765 / connect@) and clear the cross-saved duplicate.
DELETE FROM public.ru_api_credentials c
WHERE c.ru_owner_id = '741761'
  AND EXISTS (
    SELECT 1 FROM public.ru_api_credentials o
    WHERE o.access_key = c.access_key AND o.ru_owner_id <> c.ru_owner_id
  );

UPDATE public.ru_owner_accounts
SET ru_api_access_key = NULL,
    ru_api_secret_enc = NULL,
    ru_api_key_label = NULL,
    ru_api_keys_verified_at = NULL
WHERE ru_owner_id = '741761';