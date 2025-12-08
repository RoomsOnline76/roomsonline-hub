-- Add RLS policy to allow public access to nightsbridge agent code
-- The agent code is not a secret (it's part of the public booking URL), so it can be public

CREATE POLICY "Public can view nightsbridge agent code"
ON public.api_keys
FOR SELECT
USING (key_name = 'nightsbridge_agent_code');

-- Also add a policy for pms_credentials to allow reading just the agent_code for nightsbridge
-- We'll create a public view instead for better security

CREATE OR REPLACE VIEW public.public_nightsbridge_config AS
SELECT agent_code
FROM public.pms_credentials
WHERE system_type = 'nightsbridge' AND is_active = true
LIMIT 1;

-- Grant access to the view
GRANT SELECT ON public.public_nightsbridge_config TO anon, authenticated;