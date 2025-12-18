-- Add benson_environment column to properties to determine which Benson environment to use
ALTER TABLE public.properties 
ADD COLUMN benson_environment text DEFAULT 'staging';

-- Update existing properties based on their names (user can adjust later)
UPDATE public.properties 
SET benson_environment = 'production' 
WHERE name ILIKE '%demo%' AND benson_property_code IS NOT NULL;

UPDATE public.properties 
SET benson_environment = 'staging' 
WHERE name ILIKE '%staging%' AND benson_property_code IS NOT NULL;

COMMENT ON COLUMN public.properties.benson_environment IS 'Which Benson environment this property code belongs to (staging or production)';