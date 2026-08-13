-- 1. Repair log for surplus channel listing ids
CREATE TABLE public.ru_duplicate_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  unit_name text NOT NULL,
  surplus_ru_property_id text NOT NULL,
  canonical_room_type_id uuid,
  canonical_ru_property_id text,
  status text NOT NULL DEFAULT 'pending',
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ru_duplicate_repairs TO authenticated;
GRANT ALL ON public.ru_duplicate_repairs TO service_role;

ALTER TABLE public.ru_duplicate_repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view duplicate repairs"
ON public.ru_duplicate_repairs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE POLICY "Staff can manage duplicate repairs"
ON public.ru_duplicate_repairs FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE TRIGGER update_ru_duplicate_repairs_updated_at
BEFORE UPDATE ON public.ru_duplicate_repairs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Merge duplicate unit rows
DO $$
DECLARE
  grp record;
  keeper uuid;
  loser record;
BEGIN
  FOR grp IN
    SELECT property_id, lower(btrim(name)) AS norm
    FROM public.hostfully_room_types
    GROUP BY property_id, lower(btrim(name))
    HAVING count(*) > 1
  LOOP
    SELECT id INTO keeper
    FROM public.hostfully_room_types
    WHERE property_id = grp.property_id AND lower(btrim(name)) = grp.norm
    ORDER BY is_active DESC NULLS LAST,
             (rentalsunited_property_id IS NOT NULL) DESC,
             NULLIF(regexp_replace(coalesce(rentalsunited_property_id,''), '\D', '', 'g'), '')::bigint ASC NULLS LAST,
             created_at ASC
    LIMIT 1;

    -- Fill gaps on the keeper from the richest sibling
    UPDATE public.hostfully_room_types k
    SET description = coalesce(k.description, s.description),
        max_guests = coalesce(k.max_guests, s.max_guests),
        bedrooms = coalesce(k.bedrooms, s.bedrooms),
        bathrooms = coalesce(k.bathrooms, s.bathrooms),
        beds = coalesce(k.beds, s.beds),
        daily_rate = coalesce(k.daily_rate, s.daily_rate),
        room_size = coalesce(k.room_size, s.room_size),
        min_stay = coalesce(k.min_stay, s.min_stay),
        max_stay = coalesce(k.max_stay, s.max_stay),
        property_type = coalesce(k.property_type, s.property_type),
        images = CASE WHEN jsonb_array_length(coalesce(k.images,'[]'::jsonb)) = 0 THEN s.images ELSE k.images END,
        amenities = CASE WHEN jsonb_array_length(coalesce(k.amenities,'[]'::jsonb)) = 0 THEN s.amenities ELSE k.amenities END,
        bed_configuration = CASE WHEN jsonb_array_length(coalesce(k.bed_configuration,'[]'::jsonb)) = 0 THEN s.bed_configuration ELSE k.bed_configuration END,
        ru_image_tags = CASE WHEN k.ru_image_tags = '{}'::jsonb THEN s.ru_image_tags ELSE k.ru_image_tags END,
        linked_rate_type_ids = CASE WHEN coalesce(array_length(k.linked_rate_type_ids,1),0) = 0 THEN s.linked_rate_type_ids ELSE k.linked_rate_type_ids END,
        facilities_raw = CASE WHEN coalesce(array_length(k.facilities_raw,1),0) = 0 THEN s.facilities_raw ELSE k.facilities_raw END,
        linked_rolos_id = coalesce(k.linked_rolos_id, s.linked_rolos_id),
        is_active = true,
        updated_at = now()
    FROM (
      SELECT * FROM public.hostfully_room_types
      WHERE property_id = grp.property_id AND lower(btrim(name)) = grp.norm AND id <> keeper
      ORDER BY updated_at DESC LIMIT 1
    ) s
    WHERE k.id = keeper;

    FOR loser IN
      SELECT id, name, rentalsunited_property_id
      FROM public.hostfully_room_types
      WHERE property_id = grp.property_id AND lower(btrim(name)) = grp.norm AND id <> keeper
    LOOP
      -- Record surplus channel listings for cleanup
      IF loser.rentalsunited_property_id IS NOT NULL
         AND loser.rentalsunited_property_id <> ''
         AND loser.rentalsunited_property_id IS DISTINCT FROM
             (SELECT rentalsunited_property_id FROM public.hostfully_room_types WHERE id = keeper) THEN
        INSERT INTO public.ru_duplicate_repairs (
          property_id, unit_name, surplus_ru_property_id, canonical_room_type_id, canonical_ru_property_id
        )
        SELECT grp.property_id, loser.name, loser.rentalsunited_property_id, keeper, k.rentalsunited_property_id
        FROM public.hostfully_room_types k WHERE k.id = keeper;
      END IF;

      -- Repoint references
      UPDATE public.hostfully_unit_map SET room_type_id = keeper WHERE room_type_id = loser.id;
      UPDATE public.bookings SET room_type_id = keeper::text WHERE room_type_id = loser.id::text;
      UPDATE public.pricelabs_price_suggestions SET room_type_id = keeper WHERE room_type_id = loser.id;
      UPDATE public.ru_api_log SET unit_id = keeper WHERE unit_id = loser.id;
      UPDATE public.ru_sync_runs SET unit_id = keeper WHERE unit_id = loser.id;

      DELETE FROM public.hostfully_room_types WHERE id = loser.id;
    END LOOP;
  END LOOP;
END $$;

-- 3. Make duplicates impossible
CREATE UNIQUE INDEX hostfully_room_types_property_name_unique
ON public.hostfully_room_types (property_id, lower(btrim(name)));