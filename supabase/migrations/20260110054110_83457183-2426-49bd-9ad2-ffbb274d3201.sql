-- Supporting Systems table with encrypted passwords
CREATE TABLE public.supporting_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_name text NOT NULL,
  system_url text,
  login_username text,
  login_password_encrypted bytea,
  system_function text,
  category text DEFAULT 'general',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.supporting_systems ENABLE ROW LEVEL SECURITY;

-- RLS policy for admin/dev
CREATE POLICY "Admins and devs can manage supporting systems" 
ON public.supporting_systems
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- Function to encrypt system passwords
CREATE OR REPLACE FUNCTION public.encrypt_system_password(plaintext text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF plaintext IS NULL OR plaintext = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_encrypt(plaintext, current_setting('app.settings.encryption_key', true));
END;
$$;

-- Function to decrypt system passwords (admin/dev only)
CREATE OR REPLACE FUNCTION public.decrypt_system_password(encrypted_data bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF encrypted_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role)) THEN
    RETURN '[PROTECTED]';
  END IF;
  
  RETURN pgp_sym_decrypt(encrypted_data, current_setting('app.settings.encryption_key', true));
EXCEPTION WHEN OTHERS THEN
  RETURN '[DECRYPTION_ERROR]';
END;
$$;

-- Invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  cost_usd numeric(12,2) NOT NULL,
  cost_zar numeric(12,2),
  billing_type text NOT NULL CHECK (billing_type IN ('monthly', 'once_off', 'annual', 'quarterly')),
  category text DEFAULT 'general',
  vendor text,
  invoice_date date DEFAULT CURRENT_DATE,
  due_date date,
  is_paid boolean DEFAULT false,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS policy for admin/dev
CREATE POLICY "Admins and devs can manage invoices" 
ON public.invoices
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- Financial metrics table
CREATE TABLE public.financial_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date date NOT NULL UNIQUE,
  cash_balance_usd numeric(14,2),
  cash_balance_zar numeric(14,2),
  monthly_burn_usd numeric(12,2),
  monthly_revenue_usd numeric(12,2),
  runway_months numeric(4,1),
  exchange_rate numeric(6,2) DEFAULT 18.50,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.financial_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policy for admin/dev
CREATE POLICY "Admins and devs can manage financial metrics" 
ON public.financial_metrics
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- Trigger to auto-calculate runway
CREATE OR REPLACE FUNCTION public.calculate_runway()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.monthly_burn_usd IS NOT NULL AND NEW.monthly_burn_usd > 0 AND NEW.cash_balance_usd IS NOT NULL THEN
    NEW.runway_months := ROUND((NEW.cash_balance_usd / NEW.monthly_burn_usd)::numeric, 1);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER calculate_runway_trigger
BEFORE INSERT OR UPDATE ON public.financial_metrics
FOR EACH ROW
EXECUTE FUNCTION public.calculate_runway();

-- Updated_at trigger for invoices
CREATE OR REPLACE FUNCTION public.update_invoices_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_invoices_updated_at_trigger
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_invoices_updated_at();

-- Updated_at trigger for supporting_systems
CREATE TRIGGER update_supporting_systems_updated_at
BEFORE UPDATE ON public.supporting_systems
FOR EACH ROW
EXECUTE FUNCTION public.update_invoices_updated_at();