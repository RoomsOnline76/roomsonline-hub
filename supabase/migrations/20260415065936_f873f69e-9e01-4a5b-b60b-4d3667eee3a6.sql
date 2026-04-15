
-- Create ru_owner_accounts table
CREATE TABLE public.ru_owner_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_email text NOT NULL UNIQUE,
  ru_user_id text,
  ru_owner_id text,
  ru_login_email text,
  ru_login_url text DEFAULT 'https://new.rentalsunited.com',
  company_details_sent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ru_owner_accounts ENABLE ROW LEVEL SECURITY;

-- Admin/dev full access
CREATE POLICY "Admins and devs have full access to ru_owner_accounts"
ON public.ru_owner_accounts
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev')
);

-- Property owners can view their own record
CREATE POLICY "Owners can view their own RU account"
ON public.ru_owner_accounts
FOR SELECT
TO authenticated
USING (
  owner_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);

-- Updated_at trigger
CREATE TRIGGER update_ru_owner_accounts_updated_at
BEFORE UPDATE ON public.ru_owner_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
