
-- 1. Auto-queue messages when booking status changes
CREATE OR REPLACE FUNCTION public.auto_queue_booking_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_rol boolean;
  _trigger_event text;
  _template record;
  _guest_email text;
  _scheduled timestamp with time zone;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT is_rol_property INTO _is_rol FROM properties WHERE id = NEW.property_id;
  IF NOT COALESCE(_is_rol, false) THEN
    RETURN NEW;
  END IF;

  _trigger_event := CASE NEW.status
    WHEN 'confirmed' THEN 'booking_confirmed'
    WHEN 'cancelled' THEN 'cancellation'
    WHEN 'checked_in' THEN 'check_in'
    WHEN 'checked_out' THEN 'check_out'
    ELSE NULL
  END;

  IF _trigger_event IS NULL THEN
    RETURN NEW;
  END IF;

  _guest_email := NEW.guest_email;

  FOR _template IN
    SELECT id, subject, body, channel, send_offset_hours
    FROM rolos_message_templates
    WHERE property_id = NEW.property_id
      AND trigger_event = _trigger_event
      AND is_active = true
  LOOP
    _scheduled := now() + (COALESCE(_template.send_offset_hours, 0) || ' hours')::interval;
    IF _scheduled < now() - interval '5 minutes' THEN
      _scheduled := now();
    END IF;

    INSERT INTO rolos_message_queue (
      property_id, reservation_id, template_id, recipient_email,
      subject, body, channel, scheduled_at, status
    )
    VALUES (
      NEW.property_id, NEW.id, _template.id, _guest_email,
      _template.subject, _template.body, _template.channel,
      _scheduled, 'pending'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_queue_booking_message ON bookings;
CREATE TRIGGER trg_auto_queue_booking_message
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION auto_queue_booking_message();

-- 2. Auto-create folio when ROL'OS booking is confirmed (UPDATE)
CREATE OR REPLACE FUNCTION public.auto_create_booking_folio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_rol boolean;
  _folio_id uuid;
BEGIN
  IF NEW.status != 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT is_rol_property INTO _is_rol FROM properties WHERE id = NEW.property_id;
  IF NOT COALESCE(_is_rol, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.rolos_folio_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _folio_id FROM rolos_folios WHERE booking_id = NEW.id LIMIT 1;

  IF _folio_id IS NULL THEN
    INSERT INTO rolos_folios (booking_id, property_id, guest_name, balance, currency, status)
    VALUES (NEW.id, NEW.property_id, NEW.guest_name, 0, 'ZAR', 'open')
    RETURNING id INTO _folio_id;
  END IF;

  NEW.rolos_folio_id := _folio_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_booking_folio ON bookings;
CREATE TRIGGER trg_auto_create_booking_folio
  BEFORE UPDATE OF status ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_booking_folio();

-- 3. Auto-create folio on INSERT with status=confirmed
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
  IF NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT is_rol_property INTO _is_rol FROM properties WHERE id = NEW.property_id;
  IF NOT COALESCE(_is_rol, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.rolos_folio_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO rolos_folios (booking_id, property_id, guest_name, balance, currency, status)
  VALUES (NEW.id, NEW.property_id, NEW.guest_name, 0, 'ZAR', 'open')
  RETURNING id INTO _folio_id;

  NEW.rolos_folio_id := _folio_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_booking_folio_insert ON bookings;
CREATE TRIGGER trg_auto_create_booking_folio_insert
  BEFORE INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_booking_folio_on_insert();
