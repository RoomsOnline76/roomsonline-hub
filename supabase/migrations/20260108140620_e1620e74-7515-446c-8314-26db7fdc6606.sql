-- Sync system_health_components.is_active with pms_tracker_status.is_production

-- Step 1: Update existing PMS components to match is_production status
UPDATE system_health_components shc
SET is_active = COALESCE(pts.is_production, false),
    updated_at = now()
FROM pms_tracker_status pts
WHERE shc.component_key = pts.system_type
  AND shc.component_type = 'pms';

-- Step 2: Insert missing PMS systems from pms_tracker_status
INSERT INTO system_health_components (component_key, component_name, component_type, is_active, is_critical, description)
SELECT 
  pts.system_type,
  INITCAP(REPLACE(pts.system_type, '_', ' ')),
  'pms'::component_type,
  COALESCE(pts.is_production, false),
  false,
  'PMS integration - ' || INITCAP(REPLACE(pts.system_type, '_', ' '))
FROM pms_tracker_status pts
WHERE NOT EXISTS (
  SELECT 1 FROM system_health_components shc 
  WHERE shc.component_key = pts.system_type
)
ON CONFLICT (component_key) DO NOTHING;

-- Step 3: Create function to sync health component active status
CREATE OR REPLACE FUNCTION public.sync_health_component_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When is_production changes on pms_tracker_status, update system_health_components
  UPDATE system_health_components
  SET is_active = NEW.is_production,
      updated_at = now()
  WHERE component_key = NEW.system_type
    AND component_type = 'pms';
  
  -- If component doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO system_health_components (component_key, component_name, component_type, is_active, is_critical, description)
    VALUES (
      NEW.system_type,
      INITCAP(REPLACE(NEW.system_type, '_', ' ')),
      'pms'::component_type,
      NEW.is_production,
      false,
      'PMS integration - ' || INITCAP(REPLACE(NEW.system_type, '_', ' '))
    )
    ON CONFLICT (component_key) DO UPDATE
    SET is_active = EXCLUDED.is_active,
        updated_at = now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Step 4: Create trigger on pms_tracker_status
DROP TRIGGER IF EXISTS sync_pms_health_active ON pms_tracker_status;

CREATE TRIGGER sync_pms_health_active
AFTER UPDATE OF is_production ON pms_tracker_status
FOR EACH ROW
EXECUTE FUNCTION sync_health_component_active();