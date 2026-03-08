
-- Integration configs table
CREATE TABLE public.integration_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  integration_type text NOT NULL CHECK (integration_type IN ('direct', 'widget', 'booking_bar', 'full_embed', 'wordpress', 'api')),
  config jsonb DEFAULT '{}'::jsonb,
  api_key text UNIQUE,
  allowed_domains text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (property_id, integration_type)
);

-- Integration logs table
CREATE TABLE public.integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  integration_type text NOT NULL,
  event text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add integration tracking to bookings
ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS integration_type text,
  ADD COLUMN IF NOT EXISTS source_url text;

-- Enable RLS
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

-- RLS for integration_configs: owners can manage their own
CREATE POLICY "Owners can view own integration configs"
  ON public.integration_configs FOR SELECT TO authenticated
  USING (
    public.is_property_owner(property_id, auth.uid()) 
    OR public.is_linked_owner(property_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

CREATE POLICY "Owners can insert own integration configs"
  ON public.integration_configs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_property_owner(property_id, auth.uid()) 
    OR public.is_linked_owner(property_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

CREATE POLICY "Owners can update own integration configs"
  ON public.integration_configs FOR UPDATE TO authenticated
  USING (
    public.is_property_owner(property_id, auth.uid()) 
    OR public.is_linked_owner(property_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

CREATE POLICY "Owners can delete own integration configs"
  ON public.integration_configs FOR DELETE TO authenticated
  USING (
    public.is_property_owner(property_id, auth.uid()) 
    OR public.is_linked_owner(property_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

-- RLS for integration_logs: owners read-only, admin/dev full
CREATE POLICY "Owners can view own integration logs"
  ON public.integration_logs FOR SELECT TO authenticated
  USING (
    public.is_property_owner(property_id, auth.uid()) 
    OR public.is_linked_owner(property_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
  );

CREATE POLICY "Anyone can insert integration logs"
  ON public.integration_logs FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- updated_at trigger for integration_configs
CREATE TRIGGER update_integration_configs_updated_at
  BEFORE UPDATE ON public.integration_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_integration_configs_property ON public.integration_configs(property_id);
CREATE INDEX idx_integration_logs_property ON public.integration_logs(property_id);
CREATE INDEX idx_integration_logs_created ON public.integration_logs(created_at);
CREATE INDEX idx_bookings_integration_type ON public.bookings(integration_type) WHERE integration_type IS NOT NULL;
