-- Add pets column to bookings table for Hostfully pet count tracking
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS pets integer DEFAULT 0;