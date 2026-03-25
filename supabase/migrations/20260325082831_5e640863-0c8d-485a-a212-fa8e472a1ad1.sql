
-- Add payment_providers array column to properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS payment_providers text[] DEFAULT '{}';

-- Migrate existing payment_provider values into the array
UPDATE public.properties
SET payment_providers = ARRAY[payment_provider]
WHERE payment_provider IS NOT NULL
  AND payment_provider != 'default'
  AND payment_provider != ''
  AND (payment_providers IS NULL OR payment_providers = '{}');
