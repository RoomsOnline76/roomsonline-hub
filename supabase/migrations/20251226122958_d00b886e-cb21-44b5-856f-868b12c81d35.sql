-- Add hotelbeds_hotel_code column to properties table for HotelBeds integration
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS hotelbeds_hotel_code TEXT;