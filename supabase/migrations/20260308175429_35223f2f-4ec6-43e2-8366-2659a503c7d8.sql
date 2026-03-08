
-- ============================================================
-- Phase 1: Channel Manager — 5 tables + RLS + indexes + triggers
-- ============================================================

-- Enums
CREATE TYPE public.channel_name AS ENUM ('booking_com', 'airbnb', 'expedia', 'agoda', 'google_hotels', 'manual');
CREATE TYPE public.channel_connection_status AS ENUM ('active', 'paused', 'error', 'disconnected');
CREATE TYPE public.channel_sync_type AS ENUM ('push_inventory', 'pull_reservations', 'push_rates', 'full_sync');
CREATE TYPE public.channel_sync_status AS ENUM ('success', 'partial', 'failed');
CREATE TYPE public.channel_reservation_status AS ENUM ('pending', 'processed', 'failed', 'duplicate');

-- 1. rolos_channel_connections
CREATE TABLE public.rolos_channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  channel_name public.channel_name NOT NULL,
  status public.channel_connection_status NOT NULL DEFAULT 'disconnected',
  credentials jsonb DEFAULT '{}'::jsonb,
  settings jsonb DEFAULT '{"sync_interval_minutes": 15, "auto_confirm": false}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, channel_name)
);

-- 2. rolos_channel_room_mapping
CREATE TABLE public.rolos_channel_room_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.rolos_channel_connections(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.rolos_room_types(id) ON DELETE CASCADE,
  external_room_id text NOT NULL,
  external_room_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. rolos_channel_rate_mapping
CREATE TABLE public.rolos_channel_rate_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.rolos_channel_connections(id) ON DELETE CASCADE,
  rate_plan_id uuid NOT NULL REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE,
  external_rate_id text NOT NULL,
  external_rate_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. rolos_channel_sync_log
CREATE TABLE public.rolos_channel_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.rolos_channel_connections(id) ON DELETE CASCADE,
  sync_type public.channel_sync_type NOT NULL,
  status public.channel_sync_status NOT NULL,
  records_processed integer NOT NULL DEFAULT 0,
  errors jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer
);

-- 5. rolos_channel_reservations
CREATE TABLE public.rolos_channel_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.rolos_channel_connections(id) ON DELETE CASCADE,
  external_reservation_id text NOT NULL,
  channel_name public.channel_name NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status public.channel_reservation_status NOT NULL DEFAULT 'pending',
  booking_id uuid REFERENCES public.bookings(id),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (connection_id, external_reservation_id)
);

-- Indexes
CREATE INDEX idx_channel_connections_property ON public.rolos_channel_connections (property_id, channel_name);
CREATE INDEX idx_channel_sync_log_connection ON public.rolos_channel_sync_log (connection_id, started_at DESC);
CREATE INDEX idx_channel_reservations_status ON public.rolos_channel_reservations (processing_status) WHERE processing_status = 'pending';

-- Updated_at triggers
CREATE TRIGGER set_channel_connections_updated_at
  BEFORE UPDATE ON public.rolos_channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit triggers
CREATE TRIGGER audit_channel_connections
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_channel_connections
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

CREATE TRIGGER audit_channel_room_mapping
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_channel_room_mapping
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

CREATE TRIGGER audit_channel_rate_mapping
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_channel_rate_mapping
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

CREATE TRIGGER audit_channel_sync_log
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_channel_sync_log
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

CREATE TRIGGER audit_channel_reservations
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_channel_reservations
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE public.rolos_channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_channel_room_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_channel_rate_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_channel_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolos_channel_reservations ENABLE ROW LEVEL SECURITY;

-- Helper: check if user can access a connection's property
CREATE OR REPLACE FUNCTION public.can_access_channel_property(_property_id uuid, _user_id uuid)
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
        AND staff_role IN ('general_manager', 'front_desk')
    )
$$;

-- rolos_channel_connections policies
CREATE POLICY "Admin/dev full access to channel connections"
  ON public.rolos_channel_connections FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Property owners manage channel connections"
  ON public.rolos_channel_connections FOR ALL
  TO authenticated
  USING (public.is_property_owner(property_id, auth.uid()) OR public.is_linked_owner(property_id, auth.uid()))
  WITH CHECK (public.is_property_owner(property_id, auth.uid()) OR public.is_linked_owner(property_id, auth.uid()));

CREATE POLICY "Staff read channel connections"
  ON public.rolos_channel_connections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.property_staff
      WHERE property_id = rolos_channel_connections.property_id
        AND user_id = auth.uid()
        AND is_active = true
        AND staff_role IN ('general_manager', 'front_desk')
    )
  );

-- rolos_channel_room_mapping policies
CREATE POLICY "Users access room mappings via connection"
  ON public.rolos_channel_room_mapping FOR ALL
  TO authenticated
  USING (
    public.can_access_channel_property(
      (SELECT property_id FROM public.rolos_channel_connections WHERE id = connection_id),
      auth.uid()
    )
  )
  WITH CHECK (
    public.can_access_channel_property(
      (SELECT property_id FROM public.rolos_channel_connections WHERE id = connection_id),
      auth.uid()
    )
  );

-- rolos_channel_rate_mapping policies
CREATE POLICY "Users access rate mappings via connection"
  ON public.rolos_channel_rate_mapping FOR ALL
  TO authenticated
  USING (
    public.can_access_channel_property(
      (SELECT property_id FROM public.rolos_channel_connections WHERE id = connection_id),
      auth.uid()
    )
  )
  WITH CHECK (
    public.can_access_channel_property(
      (SELECT property_id FROM public.rolos_channel_connections WHERE id = connection_id),
      auth.uid()
    )
  );

-- rolos_channel_sync_log policies
CREATE POLICY "Users access sync logs via connection"
  ON public.rolos_channel_sync_log FOR ALL
  TO authenticated
  USING (
    public.can_access_channel_property(
      (SELECT property_id FROM public.rolos_channel_connections WHERE id = connection_id),
      auth.uid()
    )
  )
  WITH CHECK (
    public.can_access_channel_property(
      (SELECT property_id FROM public.rolos_channel_connections WHERE id = connection_id),
      auth.uid()
    )
  );

-- rolos_channel_reservations policies
CREATE POLICY "Users access channel reservations via connection"
  ON public.rolos_channel_reservations FOR ALL
  TO authenticated
  USING (
    public.can_access_channel_property(
      (SELECT property_id FROM public.rolos_channel_connections WHERE id = connection_id),
      auth.uid()
    )
  )
  WITH CHECK (
    public.can_access_channel_property(
      (SELECT property_id FROM public.rolos_channel_connections WHERE id = connection_id),
      auth.uid()
    )
  );
