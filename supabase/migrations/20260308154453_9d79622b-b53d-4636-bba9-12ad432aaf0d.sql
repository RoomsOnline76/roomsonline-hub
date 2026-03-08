ALTER TABLE public.rolos_maintenance_requests 
  ADD COLUMN IF NOT EXISTS completion_notes text,
  ADD COLUMN IF NOT EXISTS room_ready_confirmed boolean DEFAULT false;