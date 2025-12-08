-- Recreate the view with SECURITY INVOKER = FALSE to bypass RLS
-- The agent code is not a secret (it's part of the public booking URL), so it can be public

DROP VIEW IF EXISTS public.public_nightsbridge_config;

CREATE VIEW public.public_nightsbridge_config 
WITH (security_invoker = false)
AS
SELECT agent_code
FROM public.pms_credentials
WHERE system_type = 'nightsbridge' AND is_active = true
LIMIT 1;

-- Grant access to the view for both anonymous and authenticated users
GRANT SELECT ON public.public_nightsbridge_config TO anon, authenticated;