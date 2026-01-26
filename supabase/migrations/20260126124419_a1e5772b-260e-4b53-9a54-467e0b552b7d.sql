-- Add is_certified column for the new "Certify" milestone
ALTER TABLE pms_tracker_status 
ADD COLUMN IF NOT EXISTS is_certified boolean DEFAULT false;

COMMENT ON COLUMN pms_tracker_status.is_certified IS 'Integration certified/approved for production use';