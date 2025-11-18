-- Add owner and URL fields to properties table
ALTER TABLE public.properties
ADD COLUMN owner_name TEXT,
ADD COLUMN owner_email TEXT,
ADD COLUMN property_url TEXT;