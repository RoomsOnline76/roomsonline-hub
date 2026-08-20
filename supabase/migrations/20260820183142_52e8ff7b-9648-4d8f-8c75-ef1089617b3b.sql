CREATE OR REPLACE FUNCTION public.sync_rolos_to_overview_room_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_rol boolean;
  _overview_id uuid;
  _overview_active boolean;
BEGIN
  IF current_setting('app.syncing_room_types', true) = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT is_rol_property INTO _is_rol FROM properties WHERE id = NEW.property_id;
  IF NOT COALESCE(_is_rol, false) THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.syncing_room_types', 'true', true);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO hostfully_room_types (property_id, name, description, max_guests, daily_rate, amenities, images, is_active, linked_rolos_id)
    VALUES (NEW.property_id, NEW.name, NEW.description, COALESCE(NEW.max_occupancy, 2), NEW.default_rate, NEW.amenities, NEW.images, COALESCE(NEW.is_active, true), NEW.id)
    RETURNING id INTO _overview_id;

    IF _overview_id IS NOT NULL THEN
      UPDATE rolos_room_types SET linked_overview_id = _overview_id WHERE id = NEW.id;
      NEW.linked_overview_id := _overview_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    _overview_active := COALESCE(NEW.is_active, true);

    IF _overview_active = false AND EXISTS (
      SELECT 1
      FROM hostfully_room_types h
      JOIN properties p ON p.id = h.property_id
      WHERE h.property_id = NEW.property_id
        AND (h.id = NEW.linked_overview_id OR h.linked_rolos_id = NEW.id)
        AND h.rentalsunited_property_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(p.amenities->'room_types') = 'array' THEN p.amenities->'room_types'
              ELSE '[]'::jsonb
            END
          ) authored
          WHERE lower(btrim(COALESCE(authored->>'name', ''))) = lower(btrim(COALESCE(h.name, NEW.name, '')))
            AND COALESCE((authored->>'is_active')::boolean, true) = true
        )
    ) THEN
      _overview_active := true;
      NEW.is_active := true;
    END IF;

    IF NEW.linked_overview_id IS NOT NULL THEN
      UPDATE hostfully_room_types SET
        name = NEW.name,
        description = NEW.description,
        max_guests = COALESCE(NEW.max_occupancy, max_guests),
        daily_rate = COALESCE(NEW.default_rate, daily_rate),
        amenities = COALESCE(NEW.amenities, amenities),
        images = COALESCE(NEW.images, images),
        is_active = _overview_active
      WHERE id = NEW.linked_overview_id;
    ELSIF EXISTS (SELECT 1 FROM hostfully_room_types WHERE linked_rolos_id = NEW.id) THEN
      UPDATE hostfully_room_types SET
        name = NEW.name,
        description = NEW.description,
        max_guests = COALESCE(NEW.max_occupancy, max_guests),
        daily_rate = COALESCE(NEW.default_rate, daily_rate),
        amenities = COALESCE(NEW.amenities, amenities),
        images = COALESCE(NEW.images, images),
        is_active = _overview_active
      WHERE linked_rolos_id = NEW.id;
    END IF;
  END IF;

  PERFORM set_config('app.syncing_room_types', 'false', true);
  RETURN NEW;
END;
$function$;