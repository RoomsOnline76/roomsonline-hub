ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS cancellation_master_mode text NOT NULL DEFAULT 'unset';

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_cancellation_master_mode_check;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_cancellation_master_mode_check
  CHECK (cancellation_master_mode IN ('unset', 'policy', 'none'));

UPDATE public.properties p
SET cancellation_master_mode = 'policy'
WHERE cancellation_master_mode = 'unset'
  AND EXISTS (
    SELECT 1 FROM public.rolos_reservation_policies rp
    WHERE rp.property_id = p.id AND rp.is_master = true
  );