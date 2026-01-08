-- Add unique index on hostfully_room_types for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_hostfully_room_types_property_room 
ON public.hostfully_room_types(property_id, hostfully_room_id)
WHERE hostfully_room_id IS NOT NULL;