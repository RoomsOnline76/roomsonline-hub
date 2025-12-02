-- =============================================
-- PMS Integration Tables for Multi-PMS Support
-- =============================================

-- Table to store PMS-specific credentials (separate from api_keys for complex auth like Benson)
CREATE TABLE public.pms_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  system_type TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'staging' CHECK (environment IN ('staging', 'production')),
  username TEXT,
  password TEXT,
  api_key TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(system_type)
);

-- Enable RLS
ALTER TABLE public.pms_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can manage PMS credentials
CREATE POLICY "Admins can view pms credentials" ON public.pms_credentials
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert pms credentials" ON public.pms_credentials
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update pms credentials" ON public.pms_credentials
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete pms credentials" ON public.pms_credentials
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Table to store PMS field mappings (Benson IDs -> Internal IDs)
CREATE TABLE public.pms_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  system_type TEXT NOT NULL,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('room_type', 'rate_type', 'charge_type', 'payment_type', 'client', 'invoice')),
  external_id TEXT NOT NULL,
  external_name TEXT,
  internal_id TEXT,
  internal_name TEXT,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(property_id, system_type, mapping_type, external_id)
);

-- Enable RLS
ALTER TABLE public.pms_mappings ENABLE ROW LEVEL SECURITY;

-- Admins can manage all mappings
CREATE POLICY "Admins can manage pms mappings" ON public.pms_mappings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Owners can view mappings for their properties
CREATE POLICY "Owners can view own property mappings" ON public.pms_mappings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN profiles pr ON p.owner_email = pr.email
      WHERE p.id = pms_mappings.property_id AND pr.id = auth.uid()
    )
  );

-- Add benson_property_code to properties table
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS benson_property_code TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS checkfront_property_code TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS siteminder_property_code TEXT;

-- Table to cache external availability data
CREATE TABLE public.pms_availability_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  system_type TEXT NOT NULL,
  external_room_type_id TEXT NOT NULL,
  date DATE NOT NULL,
  available_units INTEGER DEFAULT 0,
  rates JSONB DEFAULT '{}',
  restrictions JSONB DEFAULT '{}',
  raw_data JSONB DEFAULT '{}',
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(property_id, system_type, external_room_type_id, date)
);

-- Enable RLS
ALTER TABLE public.pms_availability_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can view availability for active properties
CREATE POLICY "Anyone can view availability cache" ON public.pms_availability_cache
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM properties WHERE id = pms_availability_cache.property_id AND is_active = true
    )
  );

-- Admins can manage availability cache
CREATE POLICY "Admins can manage availability cache" ON public.pms_availability_cache
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Table to store external reservations synced from PMS
CREATE TABLE public.pms_reservations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  system_type TEXT NOT NULL,
  external_reservation_id TEXT NOT NULL,
  status TEXT,
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  rate_type_name TEXT,
  total_amount DECIMAL(18,2),
  currency TEXT DEFAULT 'ZAR',
  rooms JSONB DEFAULT '[]',
  guests JSONB DEFAULT '[]',
  charges JSONB DEFAULT '[]',
  payments JSONB DEFAULT '[]',
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(property_id, system_type, external_reservation_id)
);

-- Enable RLS
ALTER TABLE public.pms_reservations ENABLE ROW LEVEL SECURITY;

-- Admins can manage all reservations
CREATE POLICY "Admins can manage pms reservations" ON public.pms_reservations
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Owners can view reservations for their properties
CREATE POLICY "Owners can view own property reservations" ON public.pms_reservations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN profiles pr ON p.owner_email = pr.email
      WHERE p.id = pms_reservations.property_id AND pr.id = auth.uid()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_pms_credentials_updated_at
  BEFORE UPDATE ON public.pms_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pms_mappings_updated_at
  BEFORE UPDATE ON public.pms_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pms_availability_cache_updated_at
  BEFORE UPDATE ON public.pms_availability_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pms_reservations_updated_at
  BEFORE UPDATE ON public.pms_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();