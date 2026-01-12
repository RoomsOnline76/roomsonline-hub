-- Add new columns for room fields enhancement
ALTER TABLE hostfully_room_types 
ADD COLUMN IF NOT EXISTS extra_person_policy TEXT,
ADD COLUMN IF NOT EXISTS bed_configuration JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS facilities_raw TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'per-unit';

-- Add unique constraint for room upsert if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'hostfully_room_types_property_room_unique'
  ) THEN
    ALTER TABLE hostfully_room_types 
    ADD CONSTRAINT hostfully_room_types_property_room_unique 
    UNIQUE (property_id, hostfully_room_id);
  END IF;
END $$;