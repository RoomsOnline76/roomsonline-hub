
-- Backfill property_type on hostfully_room_types by stripping leading unit numbers
UPDATE public.hostfully_room_types
SET property_type = TRIM(regexp_replace(name, '^\d+\s*', ''))
WHERE property_type IS NULL
  AND name IS NOT NULL
  AND TRIM(regexp_replace(name, '^\d+\s*', '')) != '';
