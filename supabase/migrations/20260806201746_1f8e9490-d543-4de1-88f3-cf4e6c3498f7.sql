CREATE OR REPLACE FUNCTION public.rolos_room_type_capacity(_property_id uuid, _room_type_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    COALESCE((SELECT count(*) FROM public.rolos_rooms r
              WHERE r.property_id = _property_id
                AND r.room_type_id = _room_type_id
                AND COALESCE(r.status, 'available') <> 'out_of_service'), 0),
    0
  )::int
$$;

CREATE OR REPLACE FUNCTION public.rolos_apply_block_inventory(_property_id uuid, _room_type_id uuid, _start_date date, _end_date date, _delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cap integer := public.rolos_room_type_capacity(_property_id, _room_type_id);
BEGIN
  IF _end_date <= _start_date THEN
    RETURN;
  END IF;

  INSERT INTO public.rolos_inventory_calendar (property_id, room_type_id, date, total_units, booked_units, blocked_units, available_units)
  SELECT _property_id, _room_type_id, d::date, _cap, 0, GREATEST(0, _delta),
         GREATEST(_cap - GREATEST(0, _delta), 0)
  FROM generate_series(_start_date, _end_date - INTERVAL '1 day', INTERVAL '1 day') AS d
  ON CONFLICT (property_id, room_type_id, date) DO UPDATE
    SET blocked_units = GREATEST(0, public.rolos_inventory_calendar.blocked_units + _delta),
        total_units = GREATEST(public.rolos_inventory_calendar.total_units, _cap),
        available_units = GREATEST(
          GREATEST(public.rolos_inventory_calendar.total_units, _cap)
            - public.rolos_inventory_calendar.booked_units
            - GREATEST(0, public.rolos_inventory_calendar.blocked_units + _delta), 0),
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.rolos_convert_block_to_booked(_property_id uuid, _room_type_id uuid, _start_date date, _end_date date, _units integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cap integer := public.rolos_room_type_capacity(_property_id, _room_type_id);
BEGIN
  IF _end_date <= _start_date OR _units <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.rolos_inventory_calendar (property_id, room_type_id, date, total_units, booked_units, blocked_units, available_units)
  SELECT _property_id, _room_type_id, d::date, _cap, _units, 0, GREATEST(_cap - _units, 0)
  FROM generate_series(_start_date, _end_date - INTERVAL '1 day', INTERVAL '1 day') AS d
  ON CONFLICT (property_id, room_type_id, date) DO UPDATE
    SET booked_units = public.rolos_inventory_calendar.booked_units + _units,
        blocked_units = GREATEST(0, public.rolos_inventory_calendar.blocked_units - _units),
        total_units = GREATEST(public.rolos_inventory_calendar.total_units, _cap),
        available_units = GREATEST(
          GREATEST(public.rolos_inventory_calendar.total_units, _cap)
            - (public.rolos_inventory_calendar.booked_units + _units)
            - GREATEST(0, public.rolos_inventory_calendar.blocked_units - _units), 0),
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.rolos_adjust_booked_inventory(_property_id uuid, _room_type_id uuid, _start_date date, _end_date date, _delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cap integer := public.rolos_room_type_capacity(_property_id, _room_type_id);
BEGIN
  IF _end_date <= _start_date OR _delta = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.rolos_inventory_calendar (property_id, room_type_id, date, total_units, booked_units, blocked_units, available_units)
  SELECT _property_id, _room_type_id, d::date, _cap, GREATEST(0, _delta), 0,
         GREATEST(_cap - GREATEST(0, _delta), 0)
  FROM generate_series(_start_date, _end_date - INTERVAL '1 day', INTERVAL '1 day') AS d
  ON CONFLICT (property_id, room_type_id, date) DO UPDATE
    SET booked_units = GREATEST(0, public.rolos_inventory_calendar.booked_units + _delta),
        total_units = GREATEST(public.rolos_inventory_calendar.total_units, _cap),
        available_units = GREATEST(
          GREATEST(public.rolos_inventory_calendar.total_units, _cap)
            - GREATEST(0, public.rolos_inventory_calendar.booked_units + _delta)
            - public.rolos_inventory_calendar.blocked_units, 0),
        updated_at = now();
END;
$$;