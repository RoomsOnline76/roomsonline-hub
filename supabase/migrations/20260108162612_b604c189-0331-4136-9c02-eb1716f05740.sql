-- Add unique constraint on owner_id + system_type for upsert support
ALTER TABLE public.owner_pms_credentials 
ADD CONSTRAINT owner_pms_credentials_owner_system_unique 
UNIQUE (owner_id, system_type);