-- Add source_timestamp to pms_availability_cache
-- This represents when the PMS system reported this data (not when we fetched it)
ALTER TABLE public.pms_availability_cache 
ADD COLUMN IF NOT EXISTS source_timestamp timestamp with time zone;

-- Add comment explaining the distinction
COMMENT ON COLUMN public.pms_availability_cache.source_timestamp IS 'Timestamp from the PMS system indicating when this data was valid/generated at source';
COMMENT ON COLUMN public.pms_availability_cache.fetched_at IS 'Timestamp when RoomsOnline fetched this data from the PMS (last_synced_at)';