-- ============ 1. rolos_groups ============
ALTER TABLE public.rolos_groups
  ADD COLUMN IF NOT EXISTS master_folio_id uuid,
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS deposit_amount numeric,
  ADD COLUMN IF NOT EXISTS contract_ref text,
  ADD COLUMN IF NOT EXISTS cutoff_date date,
  ADD COLUMN IF NOT EXISTS notes_json jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_groups_billing_mode_check') THEN
    ALTER TABLE public.rolos_groups
      ADD CONSTRAINT rolos_groups_billing_mode_check
      CHECK (billing_mode IN ('master','individual','hybrid'));
  END IF;
END $$;

-- ============ 2. rolos_group_room_blocks ============
ALTER TABLE public.rolos_group_room_blocks
  ADD COLUMN IF NOT EXISTS picked_up_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS property_id uuid,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS attrition_charged boolean NOT NULL DEFAULT false;

UPDATE public.rolos_group_room_blocks b
SET property_id = g.property_id
FROM public.rolos_groups g
WHERE b.group_id = g.id AND b.property_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_group_room_blocks_status_check') THEN
    ALTER TABLE public.rolos_group_room_blocks
      ADD CONSTRAINT rolos_group_room_blocks_status_check
      CHECK (status IN ('blocked','released','picked_up'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_group_blocks_group ON public.rolos_group_room_blocks (group_id);
CREATE INDEX IF NOT EXISTS idx_group_blocks_property_status ON public.rolos_group_room_blocks (property_id, status);

-- ============ 3. rolos_group_reservations (rooming list) ============
ALTER TABLE public.rolos_group_reservations
  ADD COLUMN IF NOT EXISTS block_id uuid,
  ADD COLUMN IF NOT EXISTS room_type_id uuid,
  ADD COLUMN IF NOT EXISTS arrival_date date,
  ADD COLUMN IF NOT EXISTS departure_date date,
  ADD COLUMN IF NOT EXISTS room_preference text,
  ADD COLUMN IF NOT EXISTS special_requests text,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS adults integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS children integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_group_reservations_block_fk') THEN
    ALTER TABLE public.rolos_group_reservations
      ADD CONSTRAINT rolos_group_reservations_block_fk
      FOREIGN KEY (block_id) REFERENCES public.rolos_group_room_blocks(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_group_reservations_booking_fk') THEN
    ALTER TABLE public.rolos_group_reservations
      ADD CONSTRAINT rolos_group_reservations_booking_fk
      FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_group_reservations_room_type_fk') THEN
    ALTER TABLE public.rolos_group_reservations
      ADD CONSTRAINT rolos_group_reservations_room_type_fk
      FOREIGN KEY (room_type_id) REFERENCES public.rolos_room_types(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_group_res_group ON public.rolos_group_reservations (group_id);
CREATE INDEX IF NOT EXISTS idx_group_res_block ON public.rolos_group_reservations (block_id);
CREATE INDEX IF NOT EXISTS idx_group_res_booking ON public.rolos_group_reservations (booking_id);

CREATE TRIGGER trg_group_reservations_updated_at
  BEFORE UPDATE ON public.rolos_group_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 4. rolos_folios: allow group master folios ============
ALTER TABLE public.rolos_folios
  ALTER COLUMN booking_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS group_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_folios_group_fk') THEN
    ALTER TABLE public.rolos_folios
      ADD CONSTRAINT rolos_folios_group_fk
      FOREIGN KEY (group_id) REFERENCES public.rolos_groups(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_folios_owner_check') THEN
    ALTER TABLE public.rolos_folios
      ADD CONSTRAINT rolos_folios_owner_check
      CHECK ((booking_id IS NOT NULL AND group_id IS NULL) OR (booking_id IS NULL AND group_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rolos_groups_master_folio_fk') THEN
    ALTER TABLE public.rolos_groups
      ADD CONSTRAINT rolos_groups_master_folio_fk
      FOREIGN KEY (master_folio_id) REFERENCES public.rolos_folios(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rolos_folios_group ON public.rolos_folios (group_id);

-- Allow property staff / owners to read group folios the same way they read booking folios
DROP POLICY IF EXISTS "Access group master folios via property" ON public.rolos_folios;
CREATE POLICY "Access group master folios via property"
  ON public.rolos_folios FOR ALL TO authenticated
  USING (group_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()))
  WITH CHECK (group_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()));

-- ============ 5. Atomic inventory helpers ============
CREATE OR REPLACE FUNCTION public.rolos_apply_block_inventory(
  _property_id uuid,
  _room_type_id uuid,
  _start_date date,
  _end_date date,
  _delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _end_date <= _start_date THEN
    RETURN;
  END IF;

  INSERT INTO public.rolos_inventory_calendar (property_id, room_type_id, date, total_units, booked_units, blocked_units)
  SELECT _property_id, _room_type_id, d::date, 0, 0, GREATEST(0, _delta)
  FROM generate_series(_start_date, _end_date - INTERVAL '1 day', INTERVAL '1 day') AS d
  ON CONFLICT (property_id, room_type_id, date) DO UPDATE
    SET blocked_units = GREATEST(0, public.rolos_inventory_calendar.blocked_units + _delta),
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.rolos_convert_block_to_booked(
  _property_id uuid,
  _room_type_id uuid,
  _start_date date,
  _end_date date,
  _units integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _end_date <= _start_date OR _units <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.rolos_inventory_calendar (property_id, room_type_id, date, total_units, booked_units, blocked_units)
  SELECT _property_id, _room_type_id, d::date, 0, _units, 0
  FROM generate_series(_start_date, _end_date - INTERVAL '1 day', INTERVAL '1 day') AS d
  ON CONFLICT (property_id, room_type_id, date) DO UPDATE
    SET booked_units = public.rolos_inventory_calendar.booked_units + _units,
        blocked_units = GREATEST(0, public.rolos_inventory_calendar.blocked_units - _units),
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.rolos_adjust_booked_inventory(
  _property_id uuid,
  _room_type_id uuid,
  _start_date date,
  _end_date date,
  _delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _end_date <= _start_date OR _delta = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.rolos_inventory_calendar (property_id, room_type_id, date, total_units, booked_units, blocked_units)
  SELECT _property_id, _room_type_id, d::date, 0, GREATEST(0, _delta), 0
  FROM generate_series(_start_date, _end_date - INTERVAL '1 day', INTERVAL '1 day') AS d
  ON CONFLICT (property_id, room_type_id, date) DO UPDATE
    SET booked_units = GREATEST(0, public.rolos_inventory_calendar.booked_units + _delta),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.rolos_apply_block_inventory(uuid, uuid, date, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rolos_convert_block_to_booked(uuid, uuid, date, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rolos_adjust_booked_inventory(uuid, uuid, date, date, integer) TO authenticated, service_role;