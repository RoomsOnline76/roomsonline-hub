ALTER TABLE public.property_charges
  ADD COLUMN IF NOT EXISTS guests_included integer;

COMMENT ON COLUMN public.property_charges.guests_included IS 'Guests already covered by the room rate. Per-person charges only bill guests above this number. NULL = fall back to the unit base occupancy.';