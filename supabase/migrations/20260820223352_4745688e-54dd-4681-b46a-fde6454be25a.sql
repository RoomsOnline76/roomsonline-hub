-- Deliberate overbooking trail
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS overbook_override_reason text,
  ADD COLUMN IF NOT EXISTS overbook_override_by uuid,
  ADD COLUMN IF NOT EXISTS overbook_override_at timestamptz;

-- Live stays only: cancellations and no-shows never hold inventory.
CREATE OR REPLACE FUNCTION public.booking_status_is_live(_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(coalesce(_status, '')) NOT IN ('cancelled', 'canceled', 'no_show', 'declined', 'rejected', 'expired');
$$;

-- Core guard. Validates one room line against the rest of the property's live inventory.
CREATE OR REPLACE FUNCTION public.assert_room_line_bookable(
  _line_id uuid,
  _booking_id uuid,
  _room_id uuid,
  _room_type_id uuid,
  _guests integer,
  _line_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bk record;
  _max_occ integer;
  _units integer;
  _clash text;
  _demand integer;
  _type_name text;
BEGIN
  IF _line_status IS NOT NULL AND lower(_line_status) = 'cancelled' THEN
    RETURN;
  END IF;

  SELECT id, property_id, check_in_date, check_out_date, status, integration_type,
         overbook_override_reason
    INTO _bk
    FROM public.bookings
   WHERE id = _booking_id;

  IF _bk.id IS NULL THEN RETURN; END IF;
  IF NOT public.booking_status_is_live(_bk.status) THEN RETURN; END IF;
  IF _bk.check_in_date IS NULL OR _bk.check_out_date IS NULL THEN RETURN; END IF;

  -- Occupancy: a unit can never sleep more than its stated capacity (infants excluded upstream).
  IF _room_type_id IS NOT NULL AND coalesce(_guests, 0) > 0 THEN
    SELECT max_occupancy, name INTO _max_occ, _type_name
      FROM public.rolos_room_types WHERE id = _room_type_id;
    IF _max_occ IS NOT NULL AND _max_occ > 0 AND _guests > _max_occ THEN
      RAISE EXCEPTION 'OCCUPANCY_EXCEEDED: % sleeps % guest(s) — % requested.',
        coalesce(_type_name, 'This unit'), _max_occ, _guests
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Channel-side reservations are recorded even when they clash; refusing them desyncs the channel.
  IF coalesce(_bk.integration_type, 'rolos') <> 'rolos' THEN RETURN; END IF;
  -- An approved override lets an operator overbook knowingly.
  IF _bk.overbook_override_reason IS NOT NULL AND length(trim(_bk.overbook_override_reason)) > 0 THEN
    RETURN;
  END IF;

  -- Same physical unit, overlapping nights.
  IF _room_id IS NOT NULL THEN
    SELECT coalesce(b.guest_name, 'another reservation') INTO _clash
      FROM public.rolos_booking_rooms br
      JOIN public.bookings b ON b.id = br.booking_id
     WHERE br.room_id = _room_id
       AND br.booking_id <> _booking_id
       AND (_line_id IS NULL OR br.id <> _line_id)
       AND coalesce(lower(br.status), 'active') <> 'cancelled'
       AND public.booking_status_is_live(b.status)
       AND b.check_in_date < _bk.check_out_date
       AND b.check_out_date > _bk.check_in_date
     LIMIT 1;

    IF _clash IS NOT NULL THEN
      RAISE EXCEPTION 'UNIT_ALREADY_BOOKED: this unit is already held by % for these nights.', _clash
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;

  -- Room type demand must not exceed the sellable unit count.
  IF _room_type_id IS NOT NULL THEN
    SELECT count(*) INTO _units
      FROM public.rolos_rooms
     WHERE room_type_id = _room_type_id
       AND coalesce(status, 'available') <> 'out_of_service';

    IF coalesce(_units, 0) > 0 THEN
      SELECT count(*) INTO _demand
        FROM public.rolos_booking_rooms br
        JOIN public.bookings b ON b.id = br.booking_id
       WHERE br.room_type_id = _room_type_id
         AND br.booking_id <> _booking_id
         AND (_line_id IS NULL OR br.id <> _line_id)
         AND coalesce(lower(br.status), 'active') <> 'cancelled'
         AND public.booking_status_is_live(b.status)
         AND b.check_in_date < _bk.check_out_date
         AND b.check_out_date > _bk.check_in_date;

      IF _demand + 1 > _units THEN
        SELECT name INTO _type_name FROM public.rolos_room_types WHERE id = _room_type_id;
        RAISE EXCEPTION 'NO_UNITS_FREE: % has % unit(s) and all are taken for these nights.',
          coalesce(_type_name, 'This room type'), _units
          USING ERRCODE = 'exclusion_violation';
      END IF;
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_room_line_bookable(uuid, uuid, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;

-- Guard the room lines themselves.
CREATE OR REPLACE FUNCTION public.guard_booking_room_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_room_line_bookable(
    NEW.id,
    NEW.booking_id,
    NEW.room_id,
    NEW.room_type_id,
    coalesce(NEW.adults, 0) + coalesce(NEW.children, 0) + coalesce(NEW.teens, 0),
    NEW.status
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_room_line ON public.rolos_booking_rooms;
CREATE TRIGGER trg_guard_booking_room_line
BEFORE INSERT OR UPDATE OF room_id, room_type_id, adults, children, teens, status
ON public.rolos_booking_rooms
FOR EACH ROW EXECUTE FUNCTION public.guard_booking_room_line();

-- Moving a stay's dates re-validates every line it owns.
CREATE OR REPLACE FUNCTION public.guard_booking_stay_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _line record;
BEGIN
  IF NEW.check_in_date IS DISTINCT FROM OLD.check_in_date
     OR NEW.check_out_date IS DISTINCT FROM OLD.check_out_date
     OR (NOT public.booking_status_is_live(OLD.status) AND public.booking_status_is_live(NEW.status))
  THEN
    IF public.booking_status_is_live(NEW.status)
       AND coalesce(NEW.integration_type, 'rolos') = 'rolos'
       AND coalesce(trim(coalesce(NEW.overbook_override_reason, '')), '') = ''
    THEN
      FOR _line IN
        SELECT br.id, br.room_id, br.room_type_id, br.status,
               coalesce(br.adults, 0) + coalesce(br.children, 0) + coalesce(br.teens, 0) AS guests
          FROM public.rolos_booking_rooms br
         WHERE br.booking_id = NEW.id
           AND coalesce(lower(br.status), 'active') <> 'cancelled'
      LOOP
        IF _line.room_id IS NOT NULL AND EXISTS (
          SELECT 1
            FROM public.rolos_booking_rooms br2
            JOIN public.bookings b2 ON b2.id = br2.booking_id
           WHERE br2.room_id = _line.room_id
             AND br2.booking_id <> NEW.id
             AND coalesce(lower(br2.status), 'active') <> 'cancelled'
             AND public.booking_status_is_live(b2.status)
             AND b2.check_in_date < NEW.check_out_date
             AND b2.check_out_date > NEW.check_in_date
        ) THEN
          RAISE EXCEPTION 'UNIT_ALREADY_BOOKED: another reservation already holds this unit for the new dates.'
            USING ERRCODE = 'exclusion_violation';
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_stay_change ON public.bookings;
CREATE TRIGGER trg_guard_booking_stay_change
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_booking_stay_change();