-- Add Rentals United to pms_tracker_status
INSERT INTO public.pms_tracker_status (
  system_type, 
  status, 
  integration_status,
  has_account, has_docs, has_edge, has_health, has_get, has_post, has_soft_test, is_production
) VALUES (
  'rentalsunited',
  'In Development',
  'in_development',
  false, false, true, true, false, false, false, false
) ON CONFLICT (system_type) DO NOTHING;

-- Add Rentals United to system_health_components
INSERT INTO public.system_health_components (
  component_type,
  component_key,
  component_name,
  description,
  health_check_endpoint,
  is_critical,
  is_active,
  expected_latency_ms
) VALUES (
  'pms',
  'rentalsunited',
  'Rentals United',
  'Channel manager and distribution platform for vacation rentals - integration in development',
  'rentalsunited-api',
  false,
  false,
  5000
) ON CONFLICT (component_key) DO NOTHING;