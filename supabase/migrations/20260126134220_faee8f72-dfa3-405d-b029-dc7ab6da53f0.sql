-- Add active_environment column to pms_tracker_status
ALTER TABLE pms_tracker_status 
ADD COLUMN active_environment text NOT NULL DEFAULT 'sandbox' 
CHECK (active_environment IN ('sandbox', 'production'));

COMMENT ON COLUMN pms_tracker_status.active_environment IS 
  'Controls which API endpoint is used: sandbox for testing, production for live';