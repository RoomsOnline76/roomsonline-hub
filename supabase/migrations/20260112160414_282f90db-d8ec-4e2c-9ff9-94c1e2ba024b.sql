-- Create property onboarding tokens table for secure email links
CREATE TABLE public.property_onboarding_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  owner_email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for efficient lookups
CREATE INDEX idx_onboarding_tokens_token ON public.property_onboarding_tokens(token);
CREATE INDEX idx_onboarding_tokens_property ON public.property_onboarding_tokens(property_id);
CREATE INDEX idx_onboarding_tokens_expires ON public.property_onboarding_tokens(expires_at) WHERE used_at IS NULL;

-- Enable RLS
ALTER TABLE public.property_onboarding_tokens ENABLE ROW LEVEL SECURITY;

-- Admins and devs can manage all tokens
CREATE POLICY "Admins can manage onboarding tokens"
ON public.property_onboarding_tokens
FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'dev')
);

-- Owners can view tokens for their properties
CREATE POLICY "Owners can view their property tokens"
ON public.property_onboarding_tokens
FOR SELECT
USING (
  owner_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);

-- Allow public access to validate tokens (for onboarding page)
CREATE POLICY "Public can validate unexpired tokens"
ON public.property_onboarding_tokens
FOR SELECT
USING (
  expires_at > NOW() AND used_at IS NULL
);