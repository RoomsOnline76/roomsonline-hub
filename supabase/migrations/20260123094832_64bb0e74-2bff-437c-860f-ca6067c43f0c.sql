-- Add short_description column to properties table for marketing summary
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS short_description TEXT;