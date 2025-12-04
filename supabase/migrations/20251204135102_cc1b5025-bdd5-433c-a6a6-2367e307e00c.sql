-- Create checkfront_connections table for OAuth2 tokens and connection metadata
CREATE TABLE public.checkfront_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  host TEXT NOT NULL, -- e.g. 'your-company.checkfront.com'
  auth_mode TEXT NOT NULL DEFAULT 'token_pair' CHECK (auth_mode IN ('token_pair', 'oauth2')),
  oauth_client_id TEXT,
  oauth_scope TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMP WITH TIME ZONE,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(property_id)
);

-- Enable RLS
ALTER TABLE public.checkfront_connections ENABLE ROW LEVEL SECURITY;

-- Only admins can manage connections
CREATE POLICY "Admins can manage checkfront connections"
ON public.checkfront_connections
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Property owners can view their own connections (but not tokens)
CREATE POLICY "Owners can view own property connections"
ON public.checkfront_connections
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM properties p
  JOIN profiles pr ON p.owner_email = pr.email
  WHERE p.id = checkfront_connections.property_id AND pr.id = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_checkfront_connections_updated_at
BEFORE UPDATE ON public.checkfront_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for property lookups
CREATE INDEX idx_checkfront_connections_property_id ON public.checkfront_connections(property_id);