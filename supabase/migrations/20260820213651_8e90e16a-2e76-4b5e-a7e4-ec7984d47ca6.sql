ALTER TABLE public.property_availability ALTER COLUMN available_units DROP NOT NULL;
ALTER TABLE public.property_availability ALTER COLUMN available_units DROP DEFAULT;

UPDATE public.property_availability
SET available_units = NULL
WHERE available_units = 0
  AND is_stop_sell IS NOT TRUE
  AND (coalesce(external_system, '') = '' OR lower(external_system) IN ('manual','rol','rolos'))
  AND (coalesce(minimum_stay, 0) > 0
       OR coalesce(maximum_stay, 0) > 0
       OR coalesce(lead_days_advance, 0) > 0
       OR coalesce(lead_days_post, 0) > 0);