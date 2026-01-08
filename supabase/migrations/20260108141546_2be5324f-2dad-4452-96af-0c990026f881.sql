-- Remove legacy duplicate roomsonline_pms entry
DELETE FROM system_health_components 
WHERE component_key = 'roomsonline_pms';

-- Fix the remaining entry: it's an internal API, not a PMS
UPDATE system_health_components 
SET component_type = 'internal',
    component_name = 'RoomsOnline API',
    description = 'Internal RoomsOnline database API'
WHERE component_key = 'roomsonline';