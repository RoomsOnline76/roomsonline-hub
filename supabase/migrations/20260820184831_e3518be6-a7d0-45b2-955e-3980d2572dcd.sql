CREATE UNIQUE INDEX IF NOT EXISTS ru_owner_accounts_owner_id_unique
  ON public.ru_owner_accounts (ru_owner_id)
  WHERE ru_owner_id IS NOT NULL;