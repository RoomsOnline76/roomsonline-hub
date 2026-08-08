-- Rentals United drives all ROL'OS channel distribution: promote it to a critical component
-- and check it more often than the general 30-minute cadence.
UPDATE public.system_health_components
SET is_critical = true, check_interval_minutes = 10
WHERE component_key = 'rentalsunited';

-- The internal ROL'OS REST API now has a real health check; keep its cadence aligned.
UPDATE public.system_health_components
SET check_interval_minutes = 15
WHERE component_key = 'roomsonline';