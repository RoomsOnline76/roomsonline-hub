
-- Deduplicate hostfully_unit_map rows keeping newest per (property_id, hostfully_uid)
DELETE FROM public.hostfully_unit_map a
USING public.hostfully_unit_map b
WHERE a.property_id = b.property_id
  AND a.hostfully_uid = b.hostfully_uid
  AND a.created_at < b.created_at;

-- Add unique constraint on (property_id, hostfully_uid)
ALTER TABLE public.hostfully_unit_map
  ADD CONSTRAINT hostfully_unit_map_property_uid_unique
  UNIQUE (property_id, hostfully_uid);
