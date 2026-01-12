-- Property Contracts table for managing contract signing workflow
CREATE TABLE public.property_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'signed', 'declined', 'overridden')),
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Template tracking
  template_version TEXT NOT NULL DEFAULT 'v1.0',
  template_hash TEXT,
  
  -- Sending details
  sent_to_email TEXT,
  sent_at TIMESTAMPTZ,
  signing_token UUID DEFAULT gen_random_uuid(),
  token_expires_at TIMESTAMPTZ,
  
  -- Viewing/Signing
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signed_by_name TEXT,
  signed_by_email TEXT,
  signed_by_designation TEXT,
  
  -- Signature storage
  signature_image_url TEXT,
  signature_data JSONB,
  signature_ip INET,
  signature_user_agent TEXT,
  
  -- Final PDF
  pdf_url TEXT,
  unsigned_pdf_url TEXT,
  
  -- Override (admin bypass)
  override_by UUID,
  override_reason TEXT,
  override_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(property_id, version)
);

-- Indexes for performance
CREATE INDEX idx_property_contracts_property ON public.property_contracts(property_id);
CREATE INDEX idx_property_contracts_token ON public.property_contracts(signing_token) WHERE status = 'sent';
CREATE INDEX idx_property_contracts_status ON public.property_contracts(status);

-- Enable RLS
ALTER TABLE public.property_contracts ENABLE ROW LEVEL SECURITY;

-- Admins and devs can manage all contracts
CREATE POLICY "Admins and devs can manage contracts" ON public.property_contracts
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- Owners can view contracts for their properties
CREATE POLICY "Owners can view own property contracts" ON public.property_contracts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      JOIN public.profiles pr ON p.owner_email = pr.email
      WHERE p.id = property_contracts.property_id AND pr.id = auth.uid()
    )
  );

-- Create contracts storage bucket (private - signed URLs only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contracts', 'contracts', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Create signatures storage bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('signatures', 'signatures', false, 1048576, ARRAY['image/png', 'image/jpeg', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for contracts bucket
CREATE POLICY "Authenticated users can read contracts" ON storage.objects
  FOR SELECT USING (bucket_id = 'contracts' AND auth.role() = 'authenticated');

CREATE POLICY "Service role can manage contracts" ON storage.objects
  FOR ALL USING (bucket_id = 'contracts');

-- Storage policies for signatures bucket  
CREATE POLICY "Authenticated users can read signatures" ON storage.objects
  FOR SELECT USING (bucket_id = 'signatures' AND auth.role() = 'authenticated');

CREATE POLICY "Service role can manage signatures" ON storage.objects
  FOR ALL USING (bucket_id = 'signatures');

-- Trigger to enforce contract before showing property on website
CREATE OR REPLACE FUNCTION public.enforce_contract_before_activation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check when show_on_website is being set to true
  IF NEW.show_on_website = true AND (OLD.show_on_website = false OR OLD.show_on_website IS NULL) THEN
    -- Check for signed or overridden contract
    IF NOT EXISTS (
      SELECT 1 FROM public.property_contracts pc 
      WHERE pc.property_id = NEW.id 
      AND pc.status IN ('signed', 'overridden')
      ORDER BY pc.version DESC 
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'Property cannot be shown on website without a signed contract or admin override. Please send and sign the contract first.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER tr_enforce_contract_activation
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_contract_before_activation();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_property_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER tr_property_contracts_updated_at
  BEFORE UPDATE ON public.property_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_property_contracts_updated_at();

-- Backfill: Create override records for existing live properties
INSERT INTO public.property_contracts (property_id, status, override_reason, override_at, version)
SELECT 
  p.id,
  'overridden',
  'Backfill: Property was active before contract system implementation (Jan 2026)',
  NOW(),
  1
FROM public.properties p
WHERE p.show_on_website = true
AND p.is_active = true
AND NOT EXISTS (
  SELECT 1 FROM public.property_contracts pc WHERE pc.property_id = p.id
);