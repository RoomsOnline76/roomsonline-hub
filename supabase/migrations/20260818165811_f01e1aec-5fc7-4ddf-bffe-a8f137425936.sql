CREATE TABLE public.ru_retired_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ru_owner_id text NOT NULL UNIQUE,
  portal_email text,
  reason text,
  retired_by uuid,
  retired_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ru_retired_accounts TO authenticated;
GRANT ALL ON public.ru_retired_accounts TO service_role;

ALTER TABLE public.ru_retired_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage retired channel sub-accounts"
ON public.ru_retired_accounts
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE TRIGGER update_ru_retired_accounts_updated_at
BEFORE UPDATE ON public.ru_retired_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();