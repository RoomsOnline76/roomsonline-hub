-- Add refresh interval column to pms_credentials table
ALTER TABLE public.pms_credentials 
ADD COLUMN refresh_interval_minutes integer DEFAULT 60;