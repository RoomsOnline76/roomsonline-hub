ALTER TABLE public.pms_tracker_status ADD COLUMN IF NOT EXISTS has_modify boolean DEFAULT false;
ALTER TABLE public.pms_tracker_status ADD COLUMN IF NOT EXISTS has_cancel boolean DEFAULT false;