-- Phase 1: Create enum type for integration status
CREATE TYPE pms_integration_status AS ENUM (
  'coming_soon',
  'in_development',
  'parked',
  'in_testing',
  'deployed'
);

-- Phase 2: Add integration_status column to pms_tracker_status
ALTER TABLE public.pms_tracker_status 
ADD COLUMN IF NOT EXISTS integration_status pms_integration_status DEFAULT 'coming_soon';

-- Phase 3: Migrate existing data based on current status and is_production
-- Benson and NightsBridge are deployed
UPDATE public.pms_tracker_status 
SET integration_status = 'deployed'
WHERE system_type IN ('benson', 'nightsbridge');

-- HotelBeds is in testing
UPDATE public.pms_tracker_status 
SET integration_status = 'in_testing'
WHERE system_type = 'hotelbeds';

-- Systems with has_edge = true but not production are in_development
UPDATE public.pms_tracker_status 
SET integration_status = 'in_development'
WHERE has_edge = true 
  AND integration_status = 'coming_soon'
  AND system_type NOT IN ('benson', 'nightsbridge', 'hotelbeds');

-- Systems marked as "In Progress" are in_development
UPDATE public.pms_tracker_status 
SET integration_status = 'in_development'
WHERE (status ILIKE '%progress%' OR status ILIKE '%dev%')
  AND integration_status = 'coming_soon';

-- Add comment for documentation
COMMENT ON COLUMN public.pms_tracker_status.integration_status IS 
  'Lifecycle status of the PMS integration: coming_soon, in_development, parked, in_testing, deployed';