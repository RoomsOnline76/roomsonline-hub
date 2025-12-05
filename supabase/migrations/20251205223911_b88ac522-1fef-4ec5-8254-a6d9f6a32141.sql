-- Create dedicated table for PMS room types cache (for bookings)
CREATE TABLE IF NOT EXISTS public.pms_room_types_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  system_type text NOT NULL DEFAULT 'benson',
  external_room_type_id text NOT NULL,
  name text NOT NULL,
  description text,
  min_guests integer DEFAULT 1,
  max_guests integer DEFAULT 2,
  allow_teens boolean DEFAULT true,
  teen_min_age integer,
  teen_max_age integer,
  allow_children boolean DEFAULT true,
  child_min_age integer,
  child_max_age integer,
  allow_infants boolean DEFAULT true,
  infant_min_age integer,
  infant_max_age integer,
  linked_rate_type_ids jsonb DEFAULT '[]'::jsonb,
  raw_data jsonb DEFAULT '{}'::jsonb,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, system_type, external_room_type_id)
);

-- Create dedicated table for PMS rate types cache (for bookings)
CREATE TABLE IF NOT EXISTS public.pms_rate_types_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  system_type text NOT NULL DEFAULT 'benson',
  external_rate_type_id text NOT NULL,
  name text NOT NULL,
  description text,
  price_type text,
  min_stay_days integer,
  max_stay_days integer,
  min_advance_days integer,
  max_advance_days integer,
  raw_data jsonb DEFAULT '{}'::jsonb,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, system_type, external_rate_type_id)
);

-- Enable RLS
ALTER TABLE public.pms_room_types_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_rate_types_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for room types cache
CREATE POLICY "Anyone can view room types for active properties"
ON public.pms_room_types_cache
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM properties 
  WHERE properties.id = pms_room_types_cache.property_id 
  AND properties.is_active = true
));

CREATE POLICY "Admins can manage room types cache"
ON public.pms_room_types_cache
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for rate types cache
CREATE POLICY "Anyone can view rate types for active properties"
ON public.pms_rate_types_cache
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM properties 
  WHERE properties.id = pms_rate_types_cache.property_id 
  AND properties.is_active = true
));

CREATE POLICY "Admins can manage rate types cache"
ON public.pms_rate_types_cache
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add indexes for fast lookups
CREATE INDEX idx_pms_room_types_cache_property ON public.pms_room_types_cache(property_id);
CREATE INDEX idx_pms_rate_types_cache_property ON public.pms_rate_types_cache(property_id);