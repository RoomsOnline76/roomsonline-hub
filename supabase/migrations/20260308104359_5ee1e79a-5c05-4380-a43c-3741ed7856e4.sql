
-- Add linking columns for bidirectional sync
ALTER TABLE public.rolos_room_types ADD COLUMN IF NOT EXISTS linked_overview_id uuid;
ALTER TABLE public.hostfully_room_types ADD COLUMN IF NOT EXISTS linked_rolos_id uuid;

-- Create sync function: hostfully_room_types → rolos_room_types (for ROL properties only)
CREATE OR REPLACE FUNCTION public.sync_overview_to_rolos_room_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_rol boolean;
BEGIN
  -- Guard against recursive triggers
  IF current_setting('app.syncing_room_types', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Only sync for ROL properties
  SELECT is_rol_property INTO _is_rol FROM properties WHERE id = NEW.property_id;
  IF NOT COALESCE(_is_rol, false) THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.syncing_room_types', 'true', true);

  IF TG_OP = 'INSERT' THEN
    -- Create corresponding rolos_room_type
    INSERT INTO rolos_room_types (property_id, name, description, max_occupancy, default_rate, amenities, images, is_active, linked_overview_id)
    VALUES (NEW.property_id, NEW.name, NEW.description, COALESCE(NEW.max_guests, 2), NEW.daily_rate, NEW.amenities, NEW.images, COALESCE(NEW.is_active, true), NEW.id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO NEW.linked_rolos_id;

    -- Update the hostfully row with the link
    IF NEW.linked_rolos_id IS NOT NULL THEN
      UPDATE hostfully_room_types SET linked_rolos_id = NEW.linked_rolos_id WHERE id = NEW.id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.linked_rolos_id IS NOT NULL THEN
      UPDATE rolos_room_types SET
        name = NEW.name,
        description = NEW.description,
        max_occupancy = COALESCE(NEW.max_guests, max_occupancy),
        default_rate = COALESCE(NEW.daily_rate, default_rate),
        amenities = COALESCE(NEW.amenities, amenities),
        images = COALESCE(NEW.images, images),
        is_active = COALESCE(NEW.is_active, is_active)
      WHERE id = NEW.linked_rolos_id;
    ELSIF EXISTS (SELECT 1 FROM rolos_room_types WHERE linked_overview_id = NEW.id) THEN
      UPDATE rolos_room_types SET
        name = NEW.name,
        description = NEW.description,
        max_occupancy = COALESCE(NEW.max_guests, max_occupancy),
        default_rate = COALESCE(NEW.daily_rate, default_rate),
        amenities = COALESCE(NEW.amenities, amenities),
        images = COALESCE(NEW.images, images),
        is_active = COALESCE(NEW.is_active, is_active)
      WHERE linked_overview_id = NEW.id;
    END IF;
  END IF;

  PERFORM set_config('app.syncing_room_types', 'false', true);
  RETURN NEW;
END;
$$;

-- Create sync function: rolos_room_types → hostfully_room_types (for ROL properties only)
CREATE OR REPLACE FUNCTION public.sync_rolos_to_overview_room_types()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_rol boolean;
  _overview_id uuid;
BEGIN
  -- Guard against recursive triggers
  IF current_setting('app.syncing_room_types', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Only sync for ROL properties
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
    IF NEW.linked_overview_id IS NOT NULL THEN
      UPDATE hostfully_room_types SET
        name = NEW.name,
        description = NEW.description,
        max_guests = COALESCE(NEW.max_occupancy, max_guests),
        daily_rate = COALESCE(NEW.default_rate, daily_rate),
        amenities = COALESCE(NEW.amenities, amenities),
        images = COALESCE(NEW.images, images),
        is_active = COALESCE(NEW.is_active, is_active)
      WHERE id = NEW.linked_overview_id;
    ELSIF EXISTS (SELECT 1 FROM hostfully_room_types WHERE linked_rolos_id = NEW.id) THEN
      UPDATE hostfully_room_types SET
        name = NEW.name,
        description = NEW.description,
        max_guests = COALESCE(NEW.max_occupancy, max_guests),
        daily_rate = COALESCE(NEW.default_rate, daily_rate),
        amenities = COALESCE(NEW.amenities, amenities),
        images = COALESCE(NEW.images, images),
        is_active = COALESCE(NEW.is_active, is_active)
      WHERE linked_rolos_id = NEW.id;
    END IF;
  END IF;

  PERFORM set_config('app.syncing_room_types', 'false', true);
  RETURN NEW;
END;
$$;

-- Attach triggers
CREATE TRIGGER trg_sync_overview_to_rolos
  AFTER INSERT OR UPDATE ON public.hostfully_room_types
  FOR EACH ROW EXECUTE FUNCTION public.sync_overview_to_rolos_room_types();

CREATE TRIGGER trg_sync_rolos_to_overview
  AFTER INSERT OR UPDATE ON public.rolos_room_types
  FOR EACH ROW EXECUTE FUNCTION public.sync_rolos_to_overview_room_types();

-- Seed existing: link any unlinked hostfully_room_types to rolos for ROL properties
INSERT INTO rolos_room_types (property_id, name, description, max_occupancy, default_rate, amenities, images, is_active, linked_overview_id)
SELECT h.property_id, h.name, h.description, COALESCE(h.max_guests, 2), h.daily_rate, h.amenities, h.images, COALESCE(h.is_active, true), h.id
FROM hostfully_room_types h
JOIN properties p ON p.id = h.property_id AND p.is_rol_property = true
WHERE h.linked_rolos_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM rolos_room_types r WHERE r.linked_overview_id = h.id)
ON CONFLICT DO NOTHING;

-- Back-link the newly seeded records
UPDATE hostfully_room_types h SET linked_rolos_id = r.id
FROM rolos_room_types r
WHERE r.linked_overview_id = h.id AND h.linked_rolos_id IS NULL;

-- Also seed the reverse: rolos types without overview counterparts
INSERT INTO hostfully_room_types (property_id, name, description, max_guests, daily_rate, amenities, images, is_active, linked_rolos_id)
SELECT r.property_id, r.name, r.description, COALESCE(r.max_occupancy, 2), r.default_rate, r.amenities, r.images, COALESCE(r.is_active, true), r.id
FROM rolos_room_types r
JOIN properties p ON p.id = r.property_id AND p.is_rol_property = true
WHERE r.linked_overview_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM hostfully_room_types h WHERE h.linked_rolos_id = r.id)
ON CONFLICT DO NOTHING;

-- Back-link
UPDATE rolos_room_types r SET linked_overview_id = h.id
FROM hostfully_room_types h
WHERE h.linked_rolos_id = r.id AND r.linked_overview_id IS NULL;
