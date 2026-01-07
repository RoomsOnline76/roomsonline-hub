-- Add new columns for expanded progress tracking
ALTER TABLE pms_tracker_status 
ADD COLUMN IF NOT EXISTS has_account boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS has_health boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS has_soft_test boolean DEFAULT false;

-- Migrate existing has_access data to has_account
UPDATE pms_tracker_status SET has_account = COALESCE(has_access, false) WHERE has_account IS NULL OR has_account = false;