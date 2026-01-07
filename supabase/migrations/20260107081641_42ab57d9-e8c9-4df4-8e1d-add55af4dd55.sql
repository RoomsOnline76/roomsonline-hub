-- Add contact detail columns to pms_tracker_status table
ALTER TABLE pms_tracker_status
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_tel TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;