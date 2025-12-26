-- Add cloudbeds_property_id column to properties table
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS cloudbeds_property_id TEXT;