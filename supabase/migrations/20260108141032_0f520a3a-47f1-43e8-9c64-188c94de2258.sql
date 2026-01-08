-- Mark roomsonline_pms as inactive (legacy key mismatch with pms_tracker_status)
UPDATE system_health_components 
SET is_active = false, updated_at = now()
WHERE component_key = 'roomsonline_pms';