-- Phase 1.4: Confidence Scoring Foundation
-- Add AI metadata columns to properties and bookings tables

-- Add AI confidence metadata to properties table for tracking AI-generated field sources
ALTER TABLE public.properties 
ADD COLUMN IF NOT EXISTS ai_confidence_metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.properties.ai_confidence_metadata IS 'Tracks AI-generated field values with confidence scores and sources. Structure: { fieldName: { confidence: 0.95, source: "website"|"vision"|"inference", generated_at: ISO_timestamp } }';

-- Add AI metadata to bookings table for parsed special requests and AI enhancements
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS ai_metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.bookings.ai_metadata IS 'Stores AI-generated metadata including parsed special requests tags, priority flags, and guest intent signals.';

-- Add special_requests_parsed for structured NLP output (Phase 1.2)
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS special_requests_parsed JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.bookings.special_requests_parsed IS 'NLP-parsed structured tags from free-text special requests. Structure: { tags: ["early_check_in", "dietary_vegetarian"], priority: "high"|"normal", alerts: ["Allergy: feathers"] }';