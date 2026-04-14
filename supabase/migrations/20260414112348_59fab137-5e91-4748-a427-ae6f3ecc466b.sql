ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS rentalsunited_building_id TEXT;
ALTER TABLE public.hostfully_room_types ADD COLUMN IF NOT EXISTS rentalsunited_property_id TEXT;