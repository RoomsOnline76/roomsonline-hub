
-- ============================================
-- ENABLE EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================
-- CORE PMS ENTITIES
-- ============================================

-- Room type definitions
CREATE TABLE public.rolos_room_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    base_occupancy integer DEFAULT 2,
    max_occupancy integer DEFAULT 2,
    default_rate numeric,
    amenities jsonb DEFAULT '[]'::jsonb,
    images jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Physical room inventory
CREATE TABLE public.rolos_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
    room_type_id uuid REFERENCES public.rolos_room_types(id) ON DELETE SET NULL,
    room_number text NOT NULL,
    room_name text,
    floor integer,
    max_occupancy integer,
    bed_configuration jsonb DEFAULT '{}'::jsonb,
    amenities jsonb DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'available',
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(property_id, room_number)
);

-- Validate room status via trigger (not CHECK constraint for flexibility)
CREATE OR REPLACE FUNCTION public.validate_rolos_room_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('available', 'occupied', 'maintenance', 'out_of_order', 'dirty') THEN
    RAISE EXCEPTION 'Invalid room status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rolos_room_status
  BEFORE INSERT OR UPDATE ON public.rolos_rooms
  FOR EACH ROW EXECUTE FUNCTION public.validate_rolos_room_status();

-- Rate plans
CREATE TABLE public.rolos_rate_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    code text,
    description text,
    is_tax_inclusive boolean DEFAULT false,
    min_stay integer DEFAULT 1,
    max_stay integer,
    closed_to_arrival boolean[] DEFAULT ARRAY[false, false, false, false, false, false, false],
    closed_to_departure boolean[] DEFAULT ARRAY[false, false, false, false, false, false, false],
    requires_deposit boolean DEFAULT false,
    deposit_percentage integer,
    deposit_amount numeric,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Rate seasons
CREATE TABLE public.rolos_rate_seasons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rate_plan_id uuid REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    day_of_week_multipliers jsonb DEFAULT '{"mon":1,"tue":1,"wed":1,"thu":1,"fri":1,"sat":1,"sun":1}'::jsonb,
    min_stay_override integer,
    is_peak boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    EXCLUDE USING gist (rate_plan_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
);

-- Rate prices
CREATE TABLE public.rolos_rate_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id uuid REFERENCES public.rolos_rate_seasons(id) ON DELETE CASCADE NOT NULL,
    room_type_id uuid REFERENCES public.rolos_room_types(id) ON DELETE CASCADE NOT NULL,
    base_rate numeric NOT NULL,
    extra_adult_rate numeric DEFAULT 0,
    extra_child_rate numeric DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(season_id, room_type_id)
);

-- ============================================
-- GUEST MANAGEMENT
-- ============================================

CREATE TABLE public.rolos_guest_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
    email text,
    phone text,
    full_name text NOT NULL,
    address jsonb,
    nationality text,
    date_of_birth date,
    preferences jsonb DEFAULT '{}'::jsonb,
    communication_preferences jsonb DEFAULT '{"email":true,"sms":false,"whatsapp":false}'::jsonb,
    total_stays integer DEFAULT 0,
    total_spent numeric DEFAULT 0,
    last_stay_date date,
    tags text[] DEFAULT '{}',
    notes text,
    is_blacklisted boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.rolos_guest_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id uuid REFERENCES public.rolos_guest_profiles(id) ON DELETE CASCADE NOT NULL,
    booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
    comment text NOT NULL,
    is_private boolean DEFAULT true,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- ============================================
-- RESERVATION EXTENSIONS
-- ============================================

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS rolos_guest_id uuid REFERENCES public.rolos_guest_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS rolos_folio_id uuid;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS rolos_rate_plan_id uuid REFERENCES public.rolos_rate_plans(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS rolos_room_ids uuid[] DEFAULT '{}';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS rolos_check_in_time timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS rolos_check_out_time timestamptz;

-- Room assignment tracking
CREATE TABLE public.rolos_booking_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
    room_id uuid REFERENCES public.rolos_rooms(id) ON DELETE SET NULL,
    rate_charged numeric NOT NULL,
    adults integer NOT NULL DEFAULT 1,
    children integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    UNIQUE(booking_id, room_id)
);

-- ============================================
-- FINANCIAL / FOLIO SYSTEM
-- ============================================

CREATE TABLE public.rolos_folios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL UNIQUE,
    balance numeric DEFAULT 0,
    currency text DEFAULT 'ZAR',
    status text DEFAULT 'open',
    created_at timestamptz DEFAULT now(),
    closed_at timestamptz,
    updated_at timestamptz DEFAULT now()
);

-- Validate folio status via trigger
CREATE OR REPLACE FUNCTION public.validate_rolos_folio_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('open', 'closed', 'archived') THEN
    RAISE EXCEPTION 'Invalid folio status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rolos_folio_status
  BEFORE INSERT OR UPDATE ON public.rolos_folios
  FOR EACH ROW EXECUTE FUNCTION public.validate_rolos_folio_status();

CREATE TABLE public.rolos_folio_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    folio_id uuid REFERENCES public.rolos_folios(id) ON DELETE CASCADE NOT NULL,
    transaction_type text NOT NULL,
    description text NOT NULL,
    amount numeric NOT NULL,
    tax_amount numeric DEFAULT 0,
    reference text,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Validate transaction type via trigger
CREATE OR REPLACE FUNCTION public.validate_rolos_transaction_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.transaction_type NOT IN ('charge', 'payment', 'refund', 'adjustment', 'void') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', NEW.transaction_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rolos_transaction_type
  BEFORE INSERT OR UPDATE ON public.rolos_folio_transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_rolos_transaction_type();

-- Auto-recalculate folio balance on transaction changes
CREATE OR REPLACE FUNCTION public.recalculate_folio_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _folio_id uuid;
  _new_balance numeric;
BEGIN
  _folio_id := COALESCE(NEW.folio_id, OLD.folio_id);
  
  SELECT COALESCE(SUM(amount), 0) INTO _new_balance
  FROM public.rolos_folio_transactions
  WHERE folio_id = _folio_id;
  
  UPDATE public.rolos_folios
  SET balance = _new_balance, updated_at = now()
  WHERE id = _folio_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recalculate_folio_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_folio_transactions
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_folio_balance();

-- ============================================
-- HOUSEKEEPING & MAINTENANCE
-- ============================================

CREATE TABLE public.rolos_housekeeping_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid REFERENCES public.rolos_rooms(id) ON DELETE CASCADE NOT NULL,
    task_type text NOT NULL DEFAULT 'clean',
    priority text DEFAULT 'normal',
    status text DEFAULT 'pending',
    assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    scheduled_date date,
    completed_date timestamptz,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Validate housekeeping task fields
CREATE OR REPLACE FUNCTION public.validate_rolos_housekeeping_task()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.task_type NOT IN ('clean', 'deep_clean', 'inspect', 'maintenance', 'restock') THEN
    RAISE EXCEPTION 'Invalid task type: %', NEW.task_type;
  END IF;
  IF NEW.priority NOT IN ('low', 'normal', 'high', 'emergency') THEN
    RAISE EXCEPTION 'Invalid priority: %', NEW.priority;
  END IF;
  IF NEW.status NOT IN ('pending', 'assigned', 'in_progress', 'completed', 'verified') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rolos_housekeeping_task
  BEFORE INSERT OR UPDATE ON public.rolos_housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_rolos_housekeeping_task();

CREATE TABLE public.rolos_housekeeping_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
    room_id uuid REFERENCES public.rolos_rooms(id) ON DELETE CASCADE,
    task_type text DEFAULT 'clean',
    frequency text DEFAULT 'daily',
    day_of_week integer[] DEFAULT '{}',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.rolos_maintenance_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
    room_id uuid REFERENCES public.rolos_rooms(id) ON DELETE SET NULL,
    reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    issue_type text DEFAULT 'other',
    description text NOT NULL,
    priority text DEFAULT 'normal',
    status text DEFAULT 'reported',
    assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    estimated_cost numeric,
    actual_cost numeric,
    completed_date timestamptz,
    images text[] DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Validate maintenance request fields
CREATE OR REPLACE FUNCTION public.validate_rolos_maintenance_request()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.issue_type NOT IN ('plumbing', 'electrical', 'hvac', 'furniture', 'appliance', 'structural', 'other') THEN
    RAISE EXCEPTION 'Invalid issue type: %', NEW.issue_type;
  END IF;
  IF NEW.priority NOT IN ('low', 'normal', 'high', 'emergency') THEN
    RAISE EXCEPTION 'Invalid priority: %', NEW.priority;
  END IF;
  IF NEW.status NOT IN ('reported', 'assigned', 'in_progress', 'resolved', 'cannot_fix') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_rolos_maintenance_request
  BEFORE INSERT OR UPDATE ON public.rolos_maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_rolos_maintenance_request();

-- ============================================
-- REPORTING & ANALYTICS
-- ============================================

CREATE TABLE public.rolos_daily_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
    date date NOT NULL,
    available_rooms integer DEFAULT 0,
    occupied_rooms integer DEFAULT 0,
    revenue numeric DEFAULT 0,
    expenses numeric DEFAULT 0,
    cancellation_count integer DEFAULT 0,
    no_show_count integer DEFAULT 0,
    walk_in_count integer DEFAULT 0,
    adr numeric GENERATED ALWAYS AS (CASE WHEN occupied_rooms > 0 THEN revenue / occupied_rooms ELSE 0 END) STORED,
    revpar numeric GENERATED ALWAYS AS (CASE WHEN available_rooms > 0 THEN revenue / available_rooms ELSE 0 END) STORED,
    occupancy_rate numeric GENERATED ALWAYS AS (CASE WHEN available_rooms > 0 THEN (occupied_rooms::numeric / available_rooms) * 100 ELSE 0 END) STORED,
    created_at timestamptz DEFAULT now(),
    UNIQUE(property_id, date)
);

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================

CREATE TRIGGER trg_rolos_room_types_updated_at BEFORE UPDATE ON public.rolos_room_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_rooms_updated_at BEFORE UPDATE ON public.rolos_rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_rate_plans_updated_at BEFORE UPDATE ON public.rolos_rate_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_rate_seasons_updated_at BEFORE UPDATE ON public.rolos_rate_seasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_rate_prices_updated_at BEFORE UPDATE ON public.rolos_rate_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_guest_profiles_updated_at BEFORE UPDATE ON public.rolos_guest_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_folios_updated_at BEFORE UPDATE ON public.rolos_folios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_housekeeping_tasks_updated_at BEFORE UPDATE ON public.rolos_housekeeping_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_housekeeping_schedules_updated_at BEFORE UPDATE ON public.rolos_housekeeping_schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rolos_maintenance_requests_updated_at BEFORE UPDATE ON public.rolos_maintenance_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE public.rolos_room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_rate_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_rate_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_guest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_guest_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_booking_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_folio_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_housekeeping_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_daily_metrics ENABLE ROW LEVEL SECURITY;

-- Helper: check if user owns the property (via property_owners or primary owner_email)
-- Reuses existing is_property_owner() and is_linked_owner() functions

-- ROLOS_ROOM_TYPES: owner + admin/dev can view; owner can manage
CREATE POLICY "rolos_room_types_select" ON public.rolos_room_types FOR SELECT TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_room_types_insert" ON public.rolos_room_types FOR INSERT TO authenticated
  WITH CHECK (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_room_types_update" ON public.rolos_room_types FOR UPDATE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_room_types_delete" ON public.rolos_room_types FOR DELETE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- ROLOS_ROOMS
CREATE POLICY "rolos_rooms_select" ON public.rolos_rooms FOR SELECT TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_rooms_insert" ON public.rolos_rooms FOR INSERT TO authenticated
  WITH CHECK (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_rooms_update" ON public.rolos_rooms FOR UPDATE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_rooms_delete" ON public.rolos_rooms FOR DELETE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- ROLOS_RATE_PLANS
CREATE POLICY "rolos_rate_plans_select" ON public.rolos_rate_plans FOR SELECT TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_rate_plans_insert" ON public.rolos_rate_plans FOR INSERT TO authenticated
  WITH CHECK (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_rate_plans_update" ON public.rolos_rate_plans FOR UPDATE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_rate_plans_delete" ON public.rolos_rate_plans FOR DELETE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- ROLOS_RATE_SEASONS (via rate_plan -> property)
CREATE POLICY "rolos_rate_seasons_select" ON public.rolos_rate_seasons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_rate_plans rp WHERE rp.id = rate_plan_id AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_rate_seasons_insert" ON public.rolos_rate_seasons FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM rolos_rate_plans rp WHERE rp.id = rate_plan_id AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_rate_seasons_update" ON public.rolos_rate_seasons FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_rate_plans rp WHERE rp.id = rate_plan_id AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_rate_seasons_delete" ON public.rolos_rate_seasons FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_rate_plans rp WHERE rp.id = rate_plan_id AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));

-- ROLOS_RATE_PRICES (via season -> rate_plan -> property)
CREATE POLICY "rolos_rate_prices_select" ON public.rolos_rate_prices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_rate_seasons rs JOIN rolos_rate_plans rp ON rs.rate_plan_id = rp.id WHERE rs.id = season_id AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_rate_prices_insert" ON public.rolos_rate_prices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM rolos_rate_seasons rs JOIN rolos_rate_plans rp ON rs.rate_plan_id = rp.id WHERE rs.id = season_id AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_rate_prices_update" ON public.rolos_rate_prices FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_rate_seasons rs JOIN rolos_rate_plans rp ON rs.rate_plan_id = rp.id WHERE rs.id = season_id AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_rate_prices_delete" ON public.rolos_rate_prices FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_rate_seasons rs JOIN rolos_rate_plans rp ON rs.rate_plan_id = rp.id WHERE rs.id = season_id AND (is_property_owner(rp.property_id, auth.uid()) OR is_linked_owner(rp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));

-- ROLOS_GUEST_PROFILES
CREATE POLICY "rolos_guest_profiles_select" ON public.rolos_guest_profiles FOR SELECT TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_guest_profiles_insert" ON public.rolos_guest_profiles FOR INSERT TO authenticated
  WITH CHECK (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_guest_profiles_update" ON public.rolos_guest_profiles FOR UPDATE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_guest_profiles_delete" ON public.rolos_guest_profiles FOR DELETE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- ROLOS_GUEST_COMMENTS (via guest -> property)
CREATE POLICY "rolos_guest_comments_select" ON public.rolos_guest_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_guest_profiles gp WHERE gp.id = guest_id AND (is_property_owner(gp.property_id, auth.uid()) OR is_linked_owner(gp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_guest_comments_insert" ON public.rolos_guest_comments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM rolos_guest_profiles gp WHERE gp.id = guest_id AND (is_property_owner(gp.property_id, auth.uid()) OR is_linked_owner(gp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_guest_comments_delete" ON public.rolos_guest_comments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_guest_profiles gp WHERE gp.id = guest_id AND (is_property_owner(gp.property_id, auth.uid()) OR is_linked_owner(gp.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));

-- ROLOS_BOOKING_ROOMS (via booking -> property)
CREATE POLICY "rolos_booking_rooms_select" ON public.rolos_booking_rooms FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_booking_rooms_insert" ON public.rolos_booking_rooms FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_booking_rooms_update" ON public.rolos_booking_rooms FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_booking_rooms_delete" ON public.rolos_booking_rooms FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));

-- ROLOS_FOLIOS (via booking -> property)
CREATE POLICY "rolos_folios_select" ON public.rolos_folios FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_folios_insert" ON public.rolos_folios FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_folios_update" ON public.rolos_folios FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM bookings b WHERE b.id = booking_id AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));

-- ROLOS_FOLIO_TRANSACTIONS (via folio -> booking -> property)
CREATE POLICY "rolos_folio_transactions_select" ON public.rolos_folio_transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_folios f JOIN bookings b ON f.booking_id = b.id WHERE f.id = folio_id AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_folio_transactions_insert" ON public.rolos_folio_transactions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM rolos_folios f JOIN bookings b ON f.booking_id = b.id WHERE f.id = folio_id AND (is_property_owner(b.property_id, auth.uid()) OR is_linked_owner(b.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));

-- ROLOS_HOUSEKEEPING_TASKS (via room -> property)
CREATE POLICY "rolos_housekeeping_tasks_select" ON public.rolos_housekeeping_tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_rooms r WHERE r.id = room_id AND (is_property_owner(r.property_id, auth.uid()) OR is_linked_owner(r.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_housekeeping_tasks_insert" ON public.rolos_housekeeping_tasks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM rolos_rooms r WHERE r.id = room_id AND (is_property_owner(r.property_id, auth.uid()) OR is_linked_owner(r.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));
CREATE POLICY "rolos_housekeeping_tasks_update" ON public.rolos_housekeeping_tasks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM rolos_rooms r WHERE r.id = room_id AND (is_property_owner(r.property_id, auth.uid()) OR is_linked_owner(r.property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))));

-- ROLOS_HOUSEKEEPING_SCHEDULES
CREATE POLICY "rolos_housekeeping_schedules_select" ON public.rolos_housekeeping_schedules FOR SELECT TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_housekeeping_schedules_insert" ON public.rolos_housekeeping_schedules FOR INSERT TO authenticated
  WITH CHECK (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_housekeeping_schedules_update" ON public.rolos_housekeeping_schedules FOR UPDATE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_housekeeping_schedules_delete" ON public.rolos_housekeeping_schedules FOR DELETE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- ROLOS_MAINTENANCE_REQUESTS
CREATE POLICY "rolos_maintenance_requests_select" ON public.rolos_maintenance_requests FOR SELECT TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_maintenance_requests_insert" ON public.rolos_maintenance_requests FOR INSERT TO authenticated
  WITH CHECK (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_maintenance_requests_update" ON public.rolos_maintenance_requests FOR UPDATE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_maintenance_requests_delete" ON public.rolos_maintenance_requests FOR DELETE TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- ROLOS_DAILY_METRICS
CREATE POLICY "rolos_daily_metrics_select" ON public.rolos_daily_metrics FOR SELECT TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_daily_metrics_insert" ON public.rolos_daily_metrics FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));
CREATE POLICY "rolos_daily_metrics_update" ON public.rolos_daily_metrics FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_rolos_rooms_property_id ON public.rolos_rooms(property_id);
CREATE INDEX idx_rolos_rooms_status ON public.rolos_rooms(status);
CREATE INDEX idx_rolos_room_types_property_id ON public.rolos_room_types(property_id);
CREATE INDEX idx_rolos_rate_plans_property_id ON public.rolos_rate_plans(property_id);
CREATE INDEX idx_rolos_guest_profiles_property_id ON public.rolos_guest_profiles(property_id);
CREATE INDEX idx_rolos_guest_profiles_email ON public.rolos_guest_profiles(email);
CREATE INDEX idx_rolos_housekeeping_tasks_status ON public.rolos_housekeeping_tasks(status);
CREATE INDEX idx_rolos_housekeeping_tasks_scheduled ON public.rolos_housekeeping_tasks(scheduled_date);
CREATE INDEX idx_rolos_maintenance_requests_status ON public.rolos_maintenance_requests(status);
CREATE INDEX idx_rolos_daily_metrics_date ON public.rolos_daily_metrics(property_id, date);
CREATE INDEX idx_rolos_booking_rooms_booking ON public.rolos_booking_rooms(booking_id);
CREATE INDEX idx_rolos_folio_transactions_folio ON public.rolos_folio_transactions(folio_id);
CREATE INDEX idx_bookings_rolos_guest ON public.bookings(rolos_guest_id) WHERE rolos_guest_id IS NOT NULL;
