-- Phase 1: Database Schema Extensions for Hostfully Integration

-- 1.1 Extend pms_credentials table
ALTER TABLE pms_credentials 
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS available_listings JSONB,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'idle';

-- Add comment for sync_status values
COMMENT ON COLUMN pms_credentials.sync_status IS 'Status values: idle, syncing, connected, error';

-- 1.2 Extend properties table for PMS management
ALTER TABLE properties 
  ADD COLUMN IF NOT EXISTS external_metadata JSONB,
  ADD COLUMN IF NOT EXISTS pms_managed_fields TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_pms_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pms_sync_status TEXT;

-- 1.3 Add Hostfully-specific property code column
ALTER TABLE properties 
  ADD COLUMN IF NOT EXISTS hostfully_property_uid TEXT;

-- Add index for faster lookups by hostfully_property_uid
CREATE INDEX IF NOT EXISTS idx_properties_hostfully_uid ON properties(hostfully_property_uid) WHERE hostfully_property_uid IS NOT NULL;

-- Add index for external_system filtering
CREATE INDEX IF NOT EXISTS idx_properties_external_system ON properties(external_system) WHERE external_system IS NOT NULL;