-- Add linked_rate_type_ids to hostfully_room_types
ALTER TABLE hostfully_room_types 
ADD COLUMN IF NOT EXISTS linked_rate_type_ids TEXT[] DEFAULT '{}';

-- Add unique constraint to pms_rate_types_cache for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_pms_rate_types_cache_unique 
ON pms_rate_types_cache (property_id, system_type, external_rate_type_id);