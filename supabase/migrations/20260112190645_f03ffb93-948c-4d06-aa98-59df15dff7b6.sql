-- Create owner_contracts table for owner-level contracts
CREATE TABLE public.owner_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email TEXT NOT NULL,
  owner_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  template_version TEXT NOT NULL DEFAULT '1.0',
  
  -- Sending details
  sent_at TIMESTAMPTZ,
  signing_token UUID DEFAULT gen_random_uuid(),
  token_expires_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  
  -- Signature details
  signed_at TIMESTAMPTZ,
  signed_by_name TEXT,
  signed_by_email TEXT,
  signed_by_designation TEXT,
  signature_image_url TEXT,
  signature_data JSONB,
  signature_ip INET,
  signature_user_agent TEXT,
  
  -- PDFs
  pdf_url TEXT,
  unsigned_pdf_url TEXT,
  
  -- Override
  override_by UUID REFERENCES auth.users(id),
  override_reason TEXT,
  override_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(owner_email, version)
);

-- Enable RLS
ALTER TABLE public.owner_contracts ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups
CREATE INDEX idx_owner_contracts_owner_email ON public.owner_contracts(owner_email);
CREATE INDEX idx_owner_contracts_signing_token ON public.owner_contracts(signing_token);
CREATE INDEX idx_owner_contracts_status ON public.owner_contracts(status);

-- RLS Policies
-- Admins and devs can do everything
CREATE POLICY "Admins and devs full access to owner_contracts"
ON public.owner_contracts
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'dev')
);

-- Owners can view their own contracts
CREATE POLICY "Owners can view their own contracts"
ON public.owner_contracts
FOR SELECT
TO authenticated
USING (
  owner_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);

-- Updated at trigger
CREATE TRIGGER update_owner_contracts_updated_at
  BEFORE UPDATE ON public.owner_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_property_contracts_updated_at();

-- Update enforcement trigger to check owner_contracts
CREATE OR REPLACE FUNCTION public.enforce_contract_before_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only check when show_on_website is being set to true
  IF NEW.show_on_website = true AND (OLD.show_on_website = false OR OLD.show_on_website IS NULL) THEN
    -- First check owner_contracts table (new owner-level system)
    IF EXISTS (
      SELECT 1 FROM public.owner_contracts oc 
      WHERE oc.owner_email = NEW.owner_email 
      AND oc.status IN ('signed', 'overridden')
      ORDER BY oc.version DESC 
      LIMIT 1
    ) THEN
      RETURN NEW;
    END IF;
    
    -- Fallback: check legacy property_contracts table
    IF EXISTS (
      SELECT 1 FROM public.property_contracts pc 
      WHERE pc.property_id = NEW.id 
      AND pc.status IN ('signed', 'overridden')
      ORDER BY pc.version DESC 
      LIMIT 1
    ) THEN
      RETURN NEW;
    END IF;
    
    RAISE EXCEPTION 'Property cannot be shown on website without a signed contract or admin override. Please send and sign the contract first.';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Migrate existing signed property contracts to owner_contracts (only where owner_email is set)
INSERT INTO public.owner_contracts (
  owner_email,
  owner_name,
  status,
  version,
  template_version,
  sent_at,
  signing_token,
  token_expires_at,
  viewed_at,
  signed_at,
  signed_by_name,
  signed_by_email,
  signed_by_designation,
  signature_image_url,
  signature_data,
  signature_ip,
  signature_user_agent,
  pdf_url,
  unsigned_pdf_url,
  override_by,
  override_reason,
  override_at,
  created_at
)
SELECT DISTINCT ON (p.owner_email)
  p.owner_email,
  pc.signed_by_name,
  pc.status,
  pc.version,
  pc.template_version,
  pc.sent_at,
  NULL,
  NULL,
  pc.viewed_at,
  pc.signed_at,
  pc.signed_by_name,
  pc.signed_by_email,
  pc.signed_by_designation,
  pc.signature_image_url,
  pc.signature_data,
  pc.signature_ip,
  pc.signature_user_agent,
  pc.pdf_url,
  pc.unsigned_pdf_url,
  pc.override_by,
  pc.override_reason,
  pc.override_at,
  pc.created_at
FROM public.property_contracts pc
JOIN public.properties p ON pc.property_id = p.id
WHERE pc.status IN ('signed', 'overridden')
  AND p.owner_email IS NOT NULL
  AND p.owner_email != ''
ORDER BY p.owner_email, pc.signed_at DESC NULLS LAST, pc.override_at DESC NULLS LAST;