-- Add Resend to api_keys table as an additional service
INSERT INTO public.api_keys (name, key_name, key_value, is_required, description, system_type)
VALUES (
  'Resend',
  'RESEND_API_KEY',
  NULL,
  false,
  'Email delivery service for sending access request notifications and transactional emails',
  'resend'
)
ON CONFLICT DO NOTHING;