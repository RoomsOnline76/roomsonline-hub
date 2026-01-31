-- Add unique constraint for property_availability on property_id, room_type, date only
-- This allows upsert operations for manual availability management
-- Drop the existing constraint that includes external_system first if needed
-- Then create a new unique index for the upsert
CREATE UNIQUE INDEX IF NOT EXISTS property_availability_manual_upsert_idx 
ON property_availability (property_id, room_type, date);