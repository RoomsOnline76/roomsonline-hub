-- Drop the unique constraint on system_type to allow multiple environments per PMS
ALTER TABLE public.pms_credentials DROP CONSTRAINT IF EXISTS pms_credentials_system_type_key;

-- Create a composite unique constraint on system_type + environment instead
ALTER TABLE public.pms_credentials ADD CONSTRAINT pms_credentials_system_type_environment_key UNIQUE (system_type, environment);