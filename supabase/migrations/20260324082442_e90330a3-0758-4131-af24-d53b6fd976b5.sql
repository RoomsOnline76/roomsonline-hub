
-- ============================================================
-- PILLAR 1: Multi-Brand Collections
-- ============================================================

-- Add collections JSONB to properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS collections JSONB DEFAULT '[]'::jsonb;

-- Add collection_id to pms_mappings for external mapping
ALTER TABLE public.pms_mappings ADD COLUMN IF NOT EXISTS collection_id TEXT;

-- ============================================================
-- PILLAR 2: Multi-Unit Auto-Assignment
-- ============================================================

-- Add multi_unit_config to properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS multi_unit_config JSONB DEFAULT '{"enabled": false, "default_mode": "none"}'::jsonb;

-- Add unit-level columns to pms_mappings
ALTER TABLE public.pms_mappings ADD COLUMN IF NOT EXISTS parent_room_type_id TEXT;
ALTER TABLE public.pms_mappings ADD COLUMN IF NOT EXISTS child_unit_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.pms_mappings ADD COLUMN IF NOT EXISTS assignment_mode TEXT DEFAULT 'none';

-- ============================================================
-- PILLAR 3: Portfolio Groups
-- ============================================================

-- Create property_portfolios table
CREATE TABLE IF NOT EXISTS public.property_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_portfolio_id UUID REFERENCES public.property_portfolios(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create junction table
CREATE TABLE IF NOT EXISTS public.property_portfolio_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(portfolio_id, property_id)
);

-- RLS on property_portfolios
ALTER TABLE public.property_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage all portfolios"
  ON public.property_portfolios FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev')
  );

CREATE POLICY "Owners can view their portfolios"
  ON public.property_portfolios FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can manage their portfolios"
  ON public.property_portfolios FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- RLS on property_portfolio_members
ALTER TABLE public.property_portfolio_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage all portfolio members"
  ON public.property_portfolio_members FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev')
  );

CREATE POLICY "Owners can view their portfolio members"
  ON public.property_portfolio_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.property_portfolios p
      WHERE p.id = portfolio_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage their portfolio members"
  ON public.property_portfolio_members FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.property_portfolios p
      WHERE p.id = portfolio_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.property_portfolios p
      WHERE p.id = portfolio_id AND p.owner_id = auth.uid()
    )
  );

-- Update public_properties view to include collections
DROP VIEW IF EXISTS public.public_properties;

CREATE VIEW public.public_properties AS
SELECT 
    id, name, description, property_type, address, city, country,
    latitude, longitude, max_guests, bedrooms, bathrooms,
    price_per_night, images, amenities, is_active, slug,
    property_url, navigation_tags, hero_listing,
    external_system, external_id,
    brand_override_enabled, brand_primary_color, brand_secondary_color,
    brand_font_color, brand_logo_url,
    collections,
    created_at, updated_at
FROM properties
WHERE is_active = true AND permanently_deleted_at IS NULL;

GRANT SELECT ON public.public_properties TO anon, authenticated;

-- Enable realtime for portfolio tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.property_portfolios;
ALTER PUBLICATION supabase_realtime ADD TABLE public.property_portfolio_members;

-- Updated_at trigger for portfolios
CREATE TRIGGER set_portfolios_updated_at
  BEFORE UPDATE ON public.property_portfolios
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
