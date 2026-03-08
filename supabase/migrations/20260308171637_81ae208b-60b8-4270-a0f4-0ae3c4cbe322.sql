
-- ============================================================================
-- PHASE 1.1: RESERVATION ENGINE TABLES
-- ============================================================================

-- Reservation status enum
CREATE TYPE public.rolos_reservation_status AS ENUM (
  'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
);

-- Core reservations table
CREATE TABLE public.rolos_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  status rolos_reservation_status NOT NULL DEFAULT 'confirmed',
  confirmation_number text NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  guest_id uuid REFERENCES public.rolos_guest_profiles(id) ON DELETE SET NULL,
  guest_name text,
  guest_email text,
  guest_phone text,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  special_requests text,
  notes text,
  created_by uuid,
  source text DEFAULT 'direct',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reservation room assignments
CREATE TABLE public.rolos_reservation_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.rolos_reservations(id) ON DELETE CASCADE,
  room_type_id uuid REFERENCES public.rolos_room_types(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rolos_rooms(id) ON DELETE SET NULL,
  adults integer NOT NULL DEFAULT 1,
  children integer NOT NULL DEFAULT 0,
  teens integer NOT NULL DEFAULT 0,
  infants integer NOT NULL DEFAULT 0,
  rate_charged numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reservation status history for audit
CREATE TABLE public.rolos_reservation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.rolos_reservations(id) ON DELETE CASCADE,
  old_status rolos_reservation_status,
  new_status rolos_reservation_status NOT NULL,
  changed_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- PHASE 1.2: INVENTORY CALENDAR TABLE
-- ============================================================================

CREATE TABLE public.rolos_inventory_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.rolos_room_types(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_units integer NOT NULL DEFAULT 0,
  booked_units integer NOT NULL DEFAULT 0,
  blocked_units integer NOT NULL DEFAULT 0,
  available_units integer GENERATED ALWAYS AS (GREATEST(total_units - booked_units - blocked_units, 0)) STORED,
  restrictions jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint for inventory calendar
CREATE UNIQUE INDEX idx_rolos_inventory_calendar_unique 
  ON public.rolos_inventory_calendar (property_id, room_type_id, date);

-- ============================================================================
-- PHASE 1.4: PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_bookings_property_checkin 
  ON public.bookings (property_id, check_in_date);

CREATE INDEX IF NOT EXISTS idx_rolos_inventory_calendar_property_date 
  ON public.rolos_inventory_calendar (property_id, date);

CREATE INDEX IF NOT EXISTS idx_rolos_reservations_property_dates 
  ON public.rolos_reservations (property_id, check_in, check_out);

CREATE INDEX IF NOT EXISTS idx_rolos_reservations_booking 
  ON public.rolos_reservations (booking_id);

CREATE INDEX IF NOT EXISTS idx_rolos_reservation_rooms_reservation 
  ON public.rolos_reservation_rooms (reservation_id);

-- ============================================================================
-- TRIGGERS: updated_at + audit
-- ============================================================================

CREATE TRIGGER update_rolos_reservations_updated_at
  BEFORE UPDATE ON public.rolos_reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rolos_reservation_rooms_updated_at
  BEFORE UPDATE ON public.rolos_reservation_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rolos_inventory_calendar_updated_at
  BEFORE UPDATE ON public.rolos_inventory_calendar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_rolos_reservations
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_reservations
  FOR EACH ROW EXECUTE FUNCTION log_audit_change();

CREATE TRIGGER audit_rolos_reservation_rooms
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_reservation_rooms
  FOR EACH ROW EXECUTE FUNCTION log_audit_change();

CREATE TRIGGER audit_rolos_reservation_status_history
  AFTER INSERT ON public.rolos_reservation_status_history
  FOR EACH ROW EXECUTE FUNCTION log_audit_change();

CREATE TRIGGER audit_rolos_inventory_calendar
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_inventory_calendar
  FOR EACH ROW EXECUTE FUNCTION log_audit_change();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.rolos_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_reservation_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_reservation_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_inventory_calendar ENABLE ROW LEVEL SECURITY;

-- rolos_reservations policies
CREATE POLICY "Admin/dev full access on rolos_reservations"
  ON public.rolos_reservations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can manage own property reservations"
  ON public.rolos_reservations FOR ALL TO authenticated
  USING (
    is_property_owner(property_id, auth.uid()) OR 
    is_linked_owner(property_id, auth.uid())
  );

-- rolos_reservation_rooms policies
CREATE POLICY "Admin/dev full access on rolos_reservation_rooms"
  ON public.rolos_reservation_rooms FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can manage reservation rooms"
  ON public.rolos_reservation_rooms FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rolos_reservations r
      WHERE r.id = reservation_id
      AND (is_property_owner(r.property_id, auth.uid()) OR is_linked_owner(r.property_id, auth.uid()))
    )
  );

-- rolos_reservation_status_history policies
CREATE POLICY "Admin/dev full access on status history"
  ON public.rolos_reservation_status_history FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can view status history"
  ON public.rolos_reservation_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rolos_reservations r
      WHERE r.id = reservation_id
      AND (is_property_owner(r.property_id, auth.uid()) OR is_linked_owner(r.property_id, auth.uid()))
    )
  );

-- rolos_inventory_calendar policies
CREATE POLICY "Admin/dev full access on inventory calendar"
  ON public.rolos_inventory_calendar FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can manage own property inventory"
  ON public.rolos_inventory_calendar FOR ALL TO authenticated
  USING (
    is_property_owner(property_id, auth.uid()) OR 
    is_linked_owner(property_id, auth.uid())
  );
