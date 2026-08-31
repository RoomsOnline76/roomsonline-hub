ALTER TABLE public.hostfully_room_types ADD COLUMN IF NOT EXISTS standard_guests integer;

COMMENT ON COLUMN public.hostfully_room_types.standard_guests IS 'Default number of guests the published rate covers; NULL falls back to a derived value from max_guests.';