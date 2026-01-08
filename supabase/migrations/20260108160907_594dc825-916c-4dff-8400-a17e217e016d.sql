-- Create owner_pms_credentials table for owner-level PMS connections
CREATE TABLE public.owner_pms_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  system_type TEXT NOT NULL, -- 'hostfully', 'benson', etc.
  api_key TEXT,
  environment TEXT DEFAULT 'production',
  external_account_id TEXT, -- e.g., Hostfully's agency_uid
  external_account_name TEXT, -- Owner's name in the PMS
  
  -- Sync tracking
  available_listings JSONB DEFAULT '[]'::jsonb,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle', -- 'idle', 'syncing', 'connected', 'error'
  sync_error TEXT,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(owner_id, system_type)
);

-- Create hostfully_room_types table for room information
CREATE TABLE public.hostfully_room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  hostfully_room_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  max_guests INTEGER,
  bedrooms INTEGER,
  bathrooms NUMERIC,
  beds INTEGER,
  daily_rate NUMERIC,
  currency TEXT DEFAULT 'ZAR',
  images JSONB DEFAULT '[]'::jsonb,
  amenities JSONB DEFAULT '[]'::jsonb,
  raw_data JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add owner_pms_credential_id to properties
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS owner_pms_credential_id UUID REFERENCES public.owner_pms_credentials(id);

-- Create indexes
CREATE INDEX idx_owner_pms_credentials_owner_id ON public.owner_pms_credentials(owner_id);
CREATE INDEX idx_owner_pms_credentials_system_type ON public.owner_pms_credentials(system_type);
CREATE INDEX idx_hostfully_room_types_property_id ON public.hostfully_room_types(property_id);

-- Enable RLS
ALTER TABLE public.owner_pms_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostfully_room_types ENABLE ROW LEVEL SECURITY;

-- RLS policies for owner_pms_credentials
CREATE POLICY "Admins and devs can manage all owner pms credentials"
ON public.owner_pms_credentials
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can view their own pms credentials"
ON public.owner_pms_credentials
FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "Owners can update their own pms credentials"
ON public.owner_pms_credentials
FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- RLS policies for hostfully_room_types
CREATE POLICY "Admins and devs can manage all hostfully room types"
ON public.hostfully_room_types
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Anyone can view room types for active properties"
ON public.hostfully_room_types
FOR SELECT
USING (is_property_active(property_id));

CREATE POLICY "Owners can view room types for their properties"
ON public.hostfully_room_types
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id = hostfully_room_types.property_id
    AND pr.id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_owner_pms_credentials_updated_at
BEFORE UPDATE ON public.owner_pms_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hostfully_room_types_updated_at
BEFORE UPDATE ON public.hostfully_room_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();