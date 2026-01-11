-- ============================================================
-- ROOMSONLINE DATABASE HARDENING MIGRATION
-- Phase 1-8: Security, Indexes, Triggers, and Policies
-- ============================================================

-- ============================================================
-- PHASE 1: HELPER FUNCTIONS
-- ============================================================

-- 1.1 Create is_property_owner() function for RLS policies
CREATE OR REPLACE FUNCTION public.is_property_owner(_property_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id = _property_id 
      AND pr.id = _user_id
  )
$$;

COMMENT ON FUNCTION public.is_property_owner IS 
  'Checks if a user owns a property via owner_email matching profile email. Used in RLS policies.';

-- 1.2 Create can_confirm_booking() trigger function
-- Enforces: No booking may be confirmed without PMS acknowledgment (unless ROL-native)
CREATE OR REPLACE FUNCTION public.can_confirm_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only validate when status is being set to 'confirmed'
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    -- Rule: Must have external_reservation_id OR be a ROL-native booking
    IF NEW.external_reservation_id IS NULL THEN
      -- Check if property is ROL-managed (allows confirmation without PMS)
      IF NOT EXISTS (
        SELECT 1 FROM properties 
        WHERE id = NEW.property_id 
        AND is_rol_property = true
      ) THEN
        RAISE EXCEPTION 'Cannot confirm booking: external_reservation_id required for PMS-managed properties';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.can_confirm_booking IS 
  'Booking authority enforcement: prevents confirmation without PMS acknowledgment for non-ROL properties.';

-- ============================================================
-- PHASE 2: BOOKING AUTHORITY TRIGGER
-- ============================================================

-- Drop existing trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS validate_booking_confirmation ON public.bookings;

-- Create the validation trigger
CREATE TRIGGER validate_booking_confirmation
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION can_confirm_booking();

COMMENT ON TRIGGER validate_booking_confirmation ON public.bookings IS 
  'Enforces booking authority rule: no confirmation without PMS sync for PMS-managed properties.';

-- ============================================================
-- PHASE 3: MISSING INDEXES ON FOREIGN KEYS
-- ============================================================

-- bookings table
CREATE INDEX IF NOT EXISTS idx_bookings_property_id ON public.bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room_type_id ON public.bookings(room_type_id);
CREATE INDEX IF NOT EXISTS idx_bookings_rate_type_id ON public.bookings(rate_type_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON public.bookings(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);

-- pms_availability_cache
CREATE INDEX IF NOT EXISTS idx_pms_availability_property_date 
  ON public.pms_availability_cache(property_id, date);
CREATE INDEX IF NOT EXISTS idx_pms_availability_system 
  ON public.pms_availability_cache(system_type);

-- pms_room_types_cache
CREATE INDEX IF NOT EXISTS idx_pms_room_types_property 
  ON public.pms_room_types_cache(property_id);
CREATE INDEX IF NOT EXISTS idx_pms_room_types_external 
  ON public.pms_room_types_cache(external_room_type_id);

-- pms_rate_types_cache
CREATE INDEX IF NOT EXISTS idx_pms_rate_types_property 
  ON public.pms_rate_types_cache(property_id);
CREATE INDEX IF NOT EXISTS idx_pms_rate_types_external 
  ON public.pms_rate_types_cache(external_rate_type_id);

-- pms_reservations
CREATE INDEX IF NOT EXISTS idx_pms_reservations_property 
  ON public.pms_reservations(property_id);
CREATE INDEX IF NOT EXISTS idx_pms_reservations_external_id 
  ON public.pms_reservations(external_reservation_id);
CREATE INDEX IF NOT EXISTS idx_pms_reservations_dates 
  ON public.pms_reservations(arrival_date, departure_date);
CREATE INDEX IF NOT EXISTS idx_pms_reservations_status 
  ON public.pms_reservations(status);

-- pms_mappings
CREATE INDEX IF NOT EXISTS idx_pms_mappings_property 
  ON public.pms_mappings(property_id);
CREATE INDEX IF NOT EXISTS idx_pms_mappings_external 
  ON public.pms_mappings(external_id, system_type);

-- property_availability
CREATE INDEX IF NOT EXISTS idx_property_availability_lookup 
  ON public.property_availability(property_id, date, room_type);
CREATE INDEX IF NOT EXISTS idx_property_availability_date_range 
  ON public.property_availability(date);

-- property_rates
CREATE INDEX IF NOT EXISTS idx_property_rates_lookup 
  ON public.property_rates(property_id, date, room_type, rate_type);

-- sync_logs
CREATE INDEX IF NOT EXISTS idx_sync_logs_property 
  ON public.sync_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_booking 
  ON public.sync_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created 
  ON public.sync_logs(created_at DESC);

-- booking_sync_status
CREATE INDEX IF NOT EXISTS idx_booking_sync_booking 
  ON public.booking_sync_status(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_sync_status 
  ON public.booking_sync_status(sync_status);

-- hostfully_room_types
CREATE INDEX IF NOT EXISTS idx_hostfully_rooms_property 
  ON public.hostfully_room_types(property_id);
CREATE INDEX IF NOT EXISTS idx_hostfully_rooms_external 
  ON public.hostfully_room_types(hostfully_room_id);

-- owner_pms_credentials
CREATE INDEX IF NOT EXISTS idx_owner_pms_owner 
  ON public.owner_pms_credentials(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_pms_system 
  ON public.owner_pms_credentials(system_type);

-- journals
CREATE INDEX IF NOT EXISTS idx_journals_author 
  ON public.journals(author_id);
CREATE INDEX IF NOT EXISTS idx_journals_slug 
  ON public.journals(slug);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_property 
  ON public.audit_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
  ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table 
  ON public.audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created 
  ON public.audit_logs(created_at DESC);

-- help_articles
CREATE INDEX IF NOT EXISTS idx_help_articles_section 
  ON public.help_articles(section);
CREATE INDEX IF NOT EXISTS idx_help_articles_slug 
  ON public.help_articles(slug);

-- ============================================================
-- PHASE 4: PARTIAL INDEXES FOR COMMON QUERIES
-- ============================================================

-- Active properties (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_properties_active 
  ON public.properties(id) 
  WHERE is_active = true AND permanently_deleted_at IS NULL;

-- Active ROL properties
CREATE INDEX IF NOT EXISTS idx_properties_rol_active 
  ON public.properties(id) 
  WHERE is_rol_property = true AND is_active = true;

-- Hero listings
CREATE INDEX IF NOT EXISTS idx_properties_hero 
  ON public.properties(id) 
  WHERE hero_listing = true AND is_active = true;

-- Published journals
CREATE INDEX IF NOT EXISTS idx_journals_published 
  ON public.journals(publish_date DESC) 
  WHERE status = 'published';

-- Pending bookings (dashboard view)
CREATE INDEX IF NOT EXISTS idx_bookings_pending 
  ON public.bookings(created_at DESC) 
  WHERE status = 'pending';

-- Confirmed bookings
CREATE INDEX IF NOT EXISTS idx_bookings_confirmed 
  ON public.bookings(check_in_date) 
  WHERE status = 'confirmed';

-- Active PMS credentials
CREATE INDEX IF NOT EXISTS idx_pms_credentials_active 
  ON public.pms_credentials(system_type) 
  WHERE is_active = true;

-- Published help articles
CREATE INDEX IF NOT EXISTS idx_help_articles_published 
  ON public.help_articles(section, sort_order) 
  WHERE is_published = true;

-- ============================================================
-- PHASE 5: CACHE TABLE DOCUMENTATION
-- ============================================================

COMMENT ON TABLE public.pms_availability_cache IS 
  'CACHE ONLY - Write via edge functions (service role) only. Never authoritative for bookings. Source: PMS adapters.';

COMMENT ON TABLE public.pms_room_types_cache IS 
  'CACHE ONLY - Write via edge functions (service role) only. Source: PMS adapters. Use for display, not booking creation.';

COMMENT ON TABLE public.pms_rate_types_cache IS 
  'CACHE ONLY - Write via edge functions (service role) only. Source: PMS adapters. Use for display, not booking creation.';

COMMENT ON TABLE public.pms_reservations IS 
  'Synced from PMS systems via edge functions. Read-only for client applications.';

-- ============================================================
-- PHASE 6: OWNER PMS CREDENTIALS INSERT POLICY
-- ============================================================

-- Drop if exists for idempotency
DROP POLICY IF EXISTS "Owners can insert their own pms credentials" ON public.owner_pms_credentials;

-- Create insert policy for owners
CREATE POLICY "Owners can insert their own pms credentials"
  ON public.owner_pms_credentials
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- ============================================================
-- PHASE 7: DEV ROLE PROTECTION
-- ============================================================

-- Create function to protect dev role assignments
CREATE OR REPLACE FUNCTION public.protect_dev_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Prevent deletion of dev role assignments by non-devs
  IF OLD.role = 'dev' THEN
    -- Only devs can delete other dev roles
    IF NOT has_role(auth.uid(), 'dev') THEN
      RAISE EXCEPTION 'Only dev users can remove dev role assignments';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.protect_dev_roles IS 
  'Prevents non-dev users from removing dev role assignments. Security escalation prevention.';

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS protect_dev_roles_trigger ON public.user_roles;

-- Create the protection trigger
CREATE TRIGGER protect_dev_roles_trigger
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION protect_dev_roles();

COMMENT ON TRIGGER protect_dev_roles_trigger ON public.user_roles IS 
  'Prevents privilege escalation by protecting dev role deletions.';

-- ============================================================
-- PHASE 8: VERIFICATION (Comments only - run separately)
-- ============================================================

-- Run these queries manually to verify migration success:
-- 
-- 1. Verify helper functions exist and are SECURITY DEFINER:
-- SELECT routine_name, security_type
-- FROM information_schema.routines 
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('has_role', 'is_property_active', 'is_property_owner', 'can_confirm_booking', 'protect_dev_roles');
--
-- 2. Verify triggers exist:
-- SELECT trigger_name, event_object_table, action_timing, event_manipulation
-- FROM information_schema.triggers
-- WHERE trigger_schema = 'public'
--   AND trigger_name IN ('validate_booking_confirmation', 'protect_dev_roles_trigger');
--
-- 3. Count indexes per table:
-- SELECT tablename, COUNT(*) as index_count
-- FROM pg_indexes
-- WHERE schemaname = 'public'
-- GROUP BY tablename
-- ORDER BY index_count DESC;

-- ============================================================
-- END OF HARDENING MIGRATION
-- ============================================================