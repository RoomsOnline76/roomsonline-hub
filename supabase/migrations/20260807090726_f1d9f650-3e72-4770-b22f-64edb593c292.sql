ALTER TABLE public.rolos_booking_rooms
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.rolos_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rolos_booking_rooms_package ON public.rolos_booking_rooms(package_id);

-- Atomic capacity-guarded hold: check + write in one locked statement sequence so
-- two concurrent block creates cannot both pass a stale pre-check.
CREATE OR REPLACE FUNCTION public.rolos_hold_block_inventory(
  _property_id uuid,
  _room_type_id uuid,
  _start_date date,
  _end_date date,
  _units integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cap integer := public.rolos_room_type_capacity(_property_id, _room_type_id);
  _short record;
BEGIN
  IF _end_date <= _start_date OR _units <= 0 THEN
    RETURN 0;
  END IF;

  -- Materialise every night in the range so the lock below covers them all.
  INSERT INTO public.rolos_inventory_calendar (property_id, room_type_id, date, total_units, booked_units, blocked_units)
  SELECT _property_id, _room_type_id, d::date, _cap, 0, 0
  FROM generate_series(_start_date, _end_date - INTERVAL '1 day', INTERVAL '1 day') AS d
  ON CONFLICT (property_id, room_type_id, date) DO NOTHING;

  PERFORM 1
  FROM public.rolos_inventory_calendar
  WHERE property_id = _property_id
    AND room_type_id = _room_type_id
    AND date >= _start_date
    AND date < _end_date
  FOR UPDATE;

  SELECT date, available_units INTO _short
  FROM public.rolos_inventory_calendar
  WHERE property_id = _property_id
    AND room_type_id = _room_type_id
    AND date >= _start_date
    AND date < _end_date
    AND available_units < _units
  ORDER BY date
  LIMIT 1;

  IF _short.date IS NOT NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_INVENTORY: only % room(s) available on % (requested %)',
      _short.available_units, _short.date, _units;
  END IF;

  UPDATE public.rolos_inventory_calendar
  SET blocked_units = blocked_units + _units,
      total_units = GREATEST(total_units, _cap),
      updated_at = now()
  WHERE property_id = _property_id
    AND room_type_id = _room_type_id
    AND date >= _start_date
    AND date < _end_date;

  RETURN _units;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rolos_hold_block_inventory(uuid, uuid, date, date, integer) TO authenticated, service_role;