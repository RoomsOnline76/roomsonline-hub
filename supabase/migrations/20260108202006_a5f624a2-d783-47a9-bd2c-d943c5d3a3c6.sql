-- Add comprehensive fields to hostfully_room_types for complete room data sync
ALTER TABLE public.hostfully_room_types 
ADD COLUMN IF NOT EXISTS room_size NUMERIC,
ADD COLUMN IF NOT EXISTS room_size_unit TEXT DEFAULT 'SQUARE_METERS',
ADD COLUMN IF NOT EXISTS min_guests INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS min_stay INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_stay INTEGER,
ADD COLUMN IF NOT EXISTS check_in_time TEXT,
ADD COLUMN IF NOT EXISTS check_out_time TEXT,
ADD COLUMN IF NOT EXISTS cleaning_fee NUMERIC,
ADD COLUMN IF NOT EXISTS security_deposit NUMERIC,
ADD COLUMN IF NOT EXISTS extra_guest_fee NUMERIC,
ADD COLUMN IF NOT EXISTS tax_rate NUMERIC,
ADD COLUMN IF NOT EXISTS property_type TEXT,
ADD COLUMN IF NOT EXISTS wifi_network TEXT,
ADD COLUMN IF NOT EXISTS wifi_password TEXT,
ADD COLUMN IF NOT EXISTS check_in_instructions TEXT,
ADD COLUMN IF NOT EXISTS house_rules TEXT,
ADD COLUMN IF NOT EXISTS cancellation_policy TEXT,
ADD COLUMN IF NOT EXISTS address_street TEXT,
ADD COLUMN IF NOT EXISTS address_city TEXT,
ADD COLUMN IF NOT EXISTS address_state TEXT,
ADD COLUMN IF NOT EXISTS address_postal_code TEXT,
ADD COLUMN IF NOT EXISTS address_country TEXT,
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS pms_synced_fields TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON TABLE public.hostfully_room_types IS 'Stores comprehensive room/unit data synced from Hostfully properties';