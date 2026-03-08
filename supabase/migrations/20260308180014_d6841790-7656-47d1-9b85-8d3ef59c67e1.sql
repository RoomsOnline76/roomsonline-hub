
-- ============================================================
-- Phases 2-5: Financial Engine, Staff Ops, Advanced Booking, Enterprise
-- ============================================================

-- ==================== ENUMS ====================
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'bank_transfer', 'online', 'voucher', 'other');
CREATE TYPE public.payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE public.refund_status AS ENUM ('pending', 'approved', 'processed', 'rejected');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'issued', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.group_booking_status AS ENUM ('inquiry', 'tentative', 'confirmed', 'cancelled');
CREATE TYPE public.waitlist_status AS ENUM ('waiting', 'notified', 'booked', 'expired', 'cancelled');
CREATE TYPE public.pricing_rule_type AS ENUM ('occupancy_based', 'lead_time', 'day_of_week', 'seasonal', 'demand', 'manual_override');
CREATE TYPE public.event_status AS ENUM ('inquiry', 'tentative', 'confirmed', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.shift_type AS ENUM ('morning', 'afternoon', 'night', 'full_day', 'custom');

-- ==================== PHASE 2: FINANCIAL ENGINE ====================

-- Payments
CREATE TABLE public.rolos_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id uuid NOT NULL REFERENCES public.rolos_folios(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference text,
  status public.payment_status NOT NULL DEFAULT 'pending',
  gateway_transaction_id text,
  notes text,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Refunds
CREATE TABLE public.rolos_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.rolos_payments(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  status public.refund_status NOT NULL DEFAULT 'pending',
  approved_by uuid,
  processed_at timestamptz,
  gateway_refund_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Invoices
CREATE TABLE public.rolos_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id uuid NOT NULL REFERENCES public.rolos_folios(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  issued_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_total numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  pdf_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tax Rules
CREATE TABLE public.rolos_tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  rate numeric(5,2) NOT NULL,
  applies_to text NOT NULL DEFAULT 'all',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Payment Allocations (links payments to specific folio transactions)
CREATE TABLE public.rolos_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.rolos_payments(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.rolos_folio_transactions(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==================== PHASE 3: STAFF OPERATIONS ====================

-- Staff Shifts
CREATE TABLE public.rolos_staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.property_staff(id) ON DELETE CASCADE,
  shift_type public.shift_type NOT NULL DEFAULT 'full_day',
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Staff Activity Log
CREATE TABLE public.rolos_staff_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.property_staff(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==================== PHASE 4: ADVANCED BOOKING ====================

-- Groups
CREATE TABLE public.rolos_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_type text NOT NULL DEFAULT 'corporate',
  contact_name text,
  contact_email text,
  contact_phone text,
  status public.group_booking_status NOT NULL DEFAULT 'inquiry',
  check_in_date date,
  check_out_date date,
  total_rooms integer NOT NULL DEFAULT 1,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Group Room Blocks
CREATE TABLE public.rolos_group_room_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.rolos_groups(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.rolos_room_types(id) ON DELETE CASCADE,
  blocked_count integer NOT NULL DEFAULT 1,
  start_date date NOT NULL,
  end_date date NOT NULL,
  rate_override numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Group Reservations (links groups to individual bookings)
CREATE TABLE public.rolos_group_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.rolos_groups(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.rolos_reservations(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  guest_name text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Waitlist
CREATE TABLE public.rolos_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.rolos_guest_profiles(id) ON DELETE SET NULL,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_phone text,
  room_type_id uuid REFERENCES public.rolos_room_types(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.waitlist_status NOT NULL DEFAULT 'waiting',
  notified_at timestamptz,
  booked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Dynamic Pricing Rules
CREATE TABLE public.rolos_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type public.pricing_rule_type NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  adjustments jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  start_date date,
  end_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ==================== PHASE 5: ENTERPRISE ====================

-- Event Spaces
CREATE TABLE public.rolos_event_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  capacity_min integer,
  capacity_max integer,
  hourly_rate numeric(12,2),
  daily_rate numeric(12,2),
  amenities jsonb DEFAULT '[]'::jsonb,
  images jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Events
CREATE TABLE public.rolos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  space_id uuid REFERENCES public.rolos_event_spaces(id) ON DELETE SET NULL,
  name text NOT NULL,
  event_type text NOT NULL DEFAULT 'conference',
  contact_name text,
  contact_email text,
  contact_phone text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  expected_attendees integer,
  status public.event_status NOT NULL DEFAULT 'inquiry',
  total_cost numeric(12,2),
  notes text,
  special_requirements jsonb DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event Reservations (links events to room reservations for accommodation)
CREATE TABLE public.rolos_event_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.rolos_events(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES public.rolos_reservations(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  guest_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==================== INDEXES ====================
CREATE INDEX idx_payments_folio ON public.rolos_payments (folio_id);
CREATE INDEX idx_payments_property ON public.rolos_payments (property_id, created_at DESC);
CREATE INDEX idx_refunds_payment ON public.rolos_refunds (payment_id);
CREATE INDEX idx_invoices_folio ON public.rolos_invoices (folio_id);
CREATE INDEX idx_invoices_property ON public.rolos_invoices (property_id, issued_date DESC);
CREATE INDEX idx_tax_rules_property ON public.rolos_tax_rules (property_id) WHERE is_active = true;
CREATE INDEX idx_staff_shifts_property ON public.rolos_staff_shifts (property_id, start_time);
CREATE INDEX idx_staff_shifts_staff ON public.rolos_staff_shifts (staff_id, start_time);
CREATE INDEX idx_staff_activity_property ON public.rolos_staff_activity_log (property_id, created_at DESC);
CREATE INDEX idx_groups_property ON public.rolos_groups (property_id, status);
CREATE INDEX idx_waitlist_property ON public.rolos_waitlist (property_id, status) WHERE status = 'waiting';
CREATE INDEX idx_pricing_rules_property ON public.rolos_pricing_rules (property_id) WHERE is_active = true;
CREATE INDEX idx_event_spaces_property ON public.rolos_event_spaces (property_id) WHERE is_active = true;
CREATE INDEX idx_events_property ON public.rolos_events (property_id, start_at);

-- ==================== UPDATED_AT TRIGGERS ====================
CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON public.rolos_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_refunds_updated_at BEFORE UPDATE ON public.rolos_refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_invoices_updated_at BEFORE UPDATE ON public.rolos_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_tax_rules_updated_at BEFORE UPDATE ON public.rolos_tax_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_staff_shifts_updated_at BEFORE UPDATE ON public.rolos_staff_shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_groups_updated_at BEFORE UPDATE ON public.rolos_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_waitlist_updated_at BEFORE UPDATE ON public.rolos_waitlist FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_pricing_rules_updated_at BEFORE UPDATE ON public.rolos_pricing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_event_spaces_updated_at BEFORE UPDATE ON public.rolos_event_spaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_events_updated_at BEFORE UPDATE ON public.rolos_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== AUDIT TRIGGERS ====================
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON public.rolos_payments FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_refunds AFTER INSERT OR UPDATE OR DELETE ON public.rolos_refunds FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON public.rolos_invoices FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_tax_rules AFTER INSERT OR UPDATE OR DELETE ON public.rolos_tax_rules FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_payment_allocations AFTER INSERT OR UPDATE OR DELETE ON public.rolos_payment_allocations FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_staff_shifts AFTER INSERT OR UPDATE OR DELETE ON public.rolos_staff_shifts FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_staff_activity AFTER INSERT OR UPDATE OR DELETE ON public.rolos_staff_activity_log FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_groups AFTER INSERT OR UPDATE OR DELETE ON public.rolos_groups FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_group_room_blocks AFTER INSERT OR UPDATE OR DELETE ON public.rolos_group_room_blocks FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_group_reservations AFTER INSERT OR UPDATE OR DELETE ON public.rolos_group_reservations FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_waitlist AFTER INSERT OR UPDATE OR DELETE ON public.rolos_waitlist FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_pricing_rules AFTER INSERT OR UPDATE OR DELETE ON public.rolos_pricing_rules FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_event_spaces AFTER INSERT OR UPDATE OR DELETE ON public.rolos_event_spaces FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_events AFTER INSERT OR UPDATE OR DELETE ON public.rolos_events FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_event_reservations AFTER INSERT OR UPDATE OR DELETE ON public.rolos_event_reservations FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- ==================== RLS ====================
ALTER TABLE public.rolos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_staff_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_group_room_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_group_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_event_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_event_reservations ENABLE ROW LEVEL SECURITY;

-- Helper function for property-level access
CREATE OR REPLACE FUNCTION public.can_access_property(_property_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    public.has_role(_user_id, 'admin') OR
    public.has_role(_user_id, 'dev') OR
    public.is_property_owner(_property_id, _user_id) OR
    public.is_linked_owner(_property_id, _user_id) OR
    EXISTS (
      SELECT 1 FROM public.property_staff
      WHERE property_id = _property_id
        AND user_id = _user_id
        AND is_active = true
    )
$$;

-- Macro for property-scoped RLS (admin/dev/owner/staff)
-- Apply to all Phase 2-5 tables

-- Payments
CREATE POLICY "Property access for payments" ON public.rolos_payments FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Refunds
CREATE POLICY "Property access for refunds" ON public.rolos_refunds FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Invoices
CREATE POLICY "Property access for invoices" ON public.rolos_invoices FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Tax Rules
CREATE POLICY "Property access for tax rules" ON public.rolos_tax_rules FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Payment Allocations (via payment's property)
CREATE POLICY "Access payment allocations via payment" ON public.rolos_payment_allocations FOR ALL TO authenticated
  USING (
    public.can_access_property(
      (SELECT property_id FROM public.rolos_payments WHERE id = payment_id),
      auth.uid()
    )
  )
  WITH CHECK (
    public.can_access_property(
      (SELECT property_id FROM public.rolos_payments WHERE id = payment_id),
      auth.uid()
    )
  );

-- Staff Shifts
CREATE POLICY "Property access for shifts" ON public.rolos_staff_shifts FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Staff Activity Log
CREATE POLICY "Property access for activity log" ON public.rolos_staff_activity_log FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Groups
CREATE POLICY "Property access for groups" ON public.rolos_groups FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Group Room Blocks
CREATE POLICY "Access group blocks via group" ON public.rolos_group_room_blocks FOR ALL TO authenticated
  USING (
    public.can_access_property(
      (SELECT property_id FROM public.rolos_groups WHERE id = group_id),
      auth.uid()
    )
  )
  WITH CHECK (
    public.can_access_property(
      (SELECT property_id FROM public.rolos_groups WHERE id = group_id),
      auth.uid()
    )
  );

-- Group Reservations
CREATE POLICY "Access group reservations via group" ON public.rolos_group_reservations FOR ALL TO authenticated
  USING (
    public.can_access_property(
      (SELECT property_id FROM public.rolos_groups WHERE id = group_id),
      auth.uid()
    )
  )
  WITH CHECK (
    public.can_access_property(
      (SELECT property_id FROM public.rolos_groups WHERE id = group_id),
      auth.uid()
    )
  );

-- Waitlist
CREATE POLICY "Property access for waitlist" ON public.rolos_waitlist FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Pricing Rules
CREATE POLICY "Property access for pricing rules" ON public.rolos_pricing_rules FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Event Spaces
CREATE POLICY "Property access for event spaces" ON public.rolos_event_spaces FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Events
CREATE POLICY "Property access for events" ON public.rolos_events FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Event Reservations
CREATE POLICY "Access event reservations via event" ON public.rolos_event_reservations FOR ALL TO authenticated
  USING (
    public.can_access_property(
      (SELECT property_id FROM public.rolos_events WHERE id = event_id),
      auth.uid()
    )
  )
  WITH CHECK (
    public.can_access_property(
      (SELECT property_id FROM public.rolos_events WHERE id = event_id),
      auth.uid()
    )
  );

-- Invoice number sequence per property
CREATE SEQUENCE IF NOT EXISTS rolos_invoice_seq START 1001;
