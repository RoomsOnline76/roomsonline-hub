ALTER TABLE public.property_staff ADD COLUMN IF NOT EXISTS email text;

-- Backfill existing records
UPDATE public.property_staff ps
SET email = p.email
FROM public.profiles p
WHERE ps.user_id = p.id AND ps.email IS NULL;