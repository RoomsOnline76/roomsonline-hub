ALTER TABLE public.property_specials
  ALTER COLUMN applicable_room_ids TYPE text[]
  USING applicable_room_ids::text[];