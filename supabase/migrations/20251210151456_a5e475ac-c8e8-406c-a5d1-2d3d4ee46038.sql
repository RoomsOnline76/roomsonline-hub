-- Drop and recreate the public_nightsbridge_config view with SECURITY DEFINER
-- to allow anonymous users to access the agent_code
DROP VIEW IF EXISTS public_nightsbridge_config;

CREATE OR REPLACE VIEW public_nightsbridge_config 
WITH (security_invoker = false)
AS
SELECT agent_code
FROM pms_credentials
WHERE system_type = 'nightsbridge' AND is_active = true
LIMIT 1;

-- Grant select to both anon and authenticated roles
GRANT SELECT ON public_nightsbridge_config TO anon;
GRANT SELECT ON public_nightsbridge_config TO authenticated;