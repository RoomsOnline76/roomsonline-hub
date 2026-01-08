-- Create enums for health monitoring
CREATE TYPE public.component_type AS ENUM ('pms', 'internal', 'external', 'infrastructure');
CREATE TYPE public.health_status AS ENUM ('healthy', 'degraded', 'failed', 'unknown');

-- Create system_health_components table
CREATE TABLE public.system_health_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_type public.component_type NOT NULL,
  component_key text UNIQUE NOT NULL,
  component_name text NOT NULL,
  description text,
  health_check_endpoint text,
  is_critical boolean DEFAULT false,
  expected_latency_ms integer DEFAULT 5000,
  check_interval_minutes integer DEFAULT 30,
  retry_count integer DEFAULT 3,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create system_health_checks table
CREATE TABLE public.system_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_key text NOT NULL REFERENCES public.system_health_components(component_key) ON DELETE CASCADE,
  status public.health_status NOT NULL,
  latency_ms integer,
  error_code text,
  error_message text,
  response_data jsonb,
  metadata jsonb DEFAULT '{}',
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for health checks
CREATE INDEX idx_health_checks_component ON public.system_health_checks(component_key);
CREATE INDEX idx_health_checks_checked ON public.system_health_checks(checked_at DESC);
CREATE INDEX idx_health_checks_component_recent ON public.system_health_checks(component_key, checked_at DESC);

-- Create system_health_aggregates table
CREATE TABLE public.system_health_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_key text NOT NULL,
  date date NOT NULL,
  hour integer NOT NULL CHECK (hour >= 0 AND hour <= 23),
  total_checks integer DEFAULT 0,
  healthy_count integer DEFAULT 0,
  degraded_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  avg_latency_ms float,
  p95_latency_ms float,
  last_status public.health_status,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(component_key, date, hour)
);

CREATE INDEX idx_health_aggregates_component ON public.system_health_aggregates(component_key, date DESC);

-- Enable RLS on all tables
ALTER TABLE public.system_health_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_aggregates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for system_health_components
CREATE POLICY "Admins and devs can view health components"
  ON public.system_health_components FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role));

CREATE POLICY "Admins and devs can manage health components"
  ON public.system_health_components FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role));

-- RLS Policies for system_health_checks
CREATE POLICY "Admins and devs can view health checks"
  ON public.system_health_checks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role));

-- RLS Policies for system_health_aggregates
CREATE POLICY "Admins and devs can view health aggregates"
  ON public.system_health_aggregates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role));

-- Trigger to update aggregates when new checks are inserted
CREATE OR REPLACE FUNCTION public.update_health_aggregates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO system_health_aggregates (component_key, date, hour, total_checks, healthy_count, degraded_count, failed_count, last_status)
  VALUES (
    NEW.component_key,
    DATE(NEW.checked_at),
    EXTRACT(HOUR FROM NEW.checked_at)::integer,
    1,
    CASE WHEN NEW.status = 'healthy' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'degraded' THEN 1 ELSE 0 END,
    CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    NEW.status
  )
  ON CONFLICT (component_key, date, hour) DO UPDATE SET
    total_checks = system_health_aggregates.total_checks + 1,
    healthy_count = system_health_aggregates.healthy_count + CASE WHEN NEW.status = 'healthy' THEN 1 ELSE 0 END,
    degraded_count = system_health_aggregates.degraded_count + CASE WHEN NEW.status = 'degraded' THEN 1 ELSE 0 END,
    failed_count = system_health_aggregates.failed_count + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
    last_status = NEW.status,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_health_aggregates
  AFTER INSERT ON public.system_health_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_health_aggregates();

-- Trigger for updated_at on components
CREATE TRIGGER update_health_components_updated_at
  BEFORE UPDATE ON public.system_health_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial components
INSERT INTO public.system_health_components (component_type, component_key, component_name, description, health_check_endpoint, is_critical, expected_latency_ms) VALUES
  -- PMS Integrations
  ('pms', 'benson', 'Benson PMS', 'NightsBridge/Benson property management system integration', 'benson-api', true, 5000),
  ('pms', 'checkfront', 'Checkfront', 'Checkfront booking system integration', 'checkfront-api', true, 5000),
  ('pms', 'cloudbeds', 'Cloudbeds', 'Cloudbeds property management integration', 'cloudbeds-api', true, 5000),
  ('pms', 'hostfully', 'Hostfully', 'Hostfully property management integration', 'hostfully-api', false, 5000),
  ('pms', 'hotelbeds', 'HotelBeds', 'HotelBeds distribution platform integration', 'hotelbeds-api', false, 5000),
  ('pms', 'littlehotelier', 'Little Hotelier', 'Little Hotelier PMS integration', 'little-hotelier-api', true, 5000),
  ('pms', 'roomsonline_pms', 'RoomsOnline PMS', 'Internal RoomsOnline PMS adapter', 'roomsonline-pms-api', false, 3000),
  -- Internal Services
  ('internal', 'supabase_db', 'Database', 'Primary Supabase PostgreSQL database', 'database', true, 1000),
  ('internal', 'supabase_storage', 'File Storage', 'Supabase storage buckets for images and files', 'storage', false, 2000),
  ('internal', 'edge_runtime', 'Edge Functions', 'Supabase edge function runtime environment', 'edge', true, 3000),
  -- External Services
  ('external', 'resend_email', 'Resend Email', 'Resend email delivery service', 'resend', true, 3000),
  ('external', 'addpay_gateway', 'AddPay Payments', 'AddPay payment gateway integration', 'addpay', true, 5000),
  ('external', 'google_maps', 'Google Maps', 'Google Maps geocoding and display services', 'google_maps', false, 2000),
  ('external', 'tripadvisor', 'TripAdvisor', 'TripAdvisor reviews integration', 'tripadvisor', false, 5000),
  -- Infrastructure
  ('infrastructure', 'booking_engine', 'Booking Engine', 'Core booking creation and validation engine', 'push-booking', true, 5000),
  ('infrastructure', 'availability_cache', 'Availability Cache', 'PMS availability data cache freshness', 'availability_cache', true, 1000);