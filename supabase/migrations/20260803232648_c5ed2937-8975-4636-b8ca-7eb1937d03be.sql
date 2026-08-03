CREATE OR REPLACE FUNCTION public.auto_create_booking_folio_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_rol boolean;
  _folio_id uuid;
BEGIN
  IF NEW.status != 'confirmed' OR NEW.rolos_folio_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT is_rol_property INTO _is_rol FROM properties WHERE id = NEW.property_id;
  IF NOT COALESCE(_is_rol, false) THEN
    RETURN NULL;
  END IF;

  INSERT INTO rolos_folios (booking_id, property_id, guest_name, balance, currency, status)
  VALUES (NEW.id, NEW.property_id, NEW.guest_name, 0, 'ZAR', 'open')
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING id INTO _folio_id;

  IF _folio_id IS NULL THEN
    SELECT id INTO _folio_id FROM rolos_folios WHERE booking_id = NEW.id;
  END IF;

  UPDATE bookings SET rolos_folio_id = _folio_id WHERE id = NEW.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_booking_folio_insert ON bookings;
CREATE TRIGGER trg_auto_create_booking_folio_insert
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_booking_folio_on_insert();