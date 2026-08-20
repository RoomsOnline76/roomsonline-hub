-- Distribution is the default state; a pause must be deliberate and explained.
ALTER TABLE public.properties
  ALTER COLUMN ru_push_enabled SET DEFAULT true;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ru_hold_reason text,
  ADD COLUMN IF NOT EXISTS ru_hold_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS ru_hold_set_by uuid;

COMMENT ON COLUMN public.properties.ru_push_enabled IS
  'True = channel distribution active (default). False = explicit hold; see ru_hold_reason/ru_hold_set_at/ru_hold_set_by.';

-- Safety net: anything with live channel listings must not sit silently switched off.
UPDATE public.properties p
   SET ru_push_enabled = true
 WHERE p.ru_push_enabled = false
   AND p.ru_hold_reason IS NULL
   AND (
     p.rentalsunited_property_id IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.hostfully_room_types r
        WHERE r.property_id = p.id
          AND r.is_active = true
          AND r.rentalsunited_property_id IS NOT NULL
     )
   );

-- One rule instead of two: the default covers what this trigger used to do.
DROP TRIGGER IF EXISTS trg_auto_enable_ru_push ON public.properties;
DROP FUNCTION IF EXISTS public.auto_enable_ru_push();