UPDATE public.properties p
SET rentalsunited_property_id = NULL
WHERE p.rentalsunited_property_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.ru_api_credentials c
    WHERE c.ru_owner_id = p.rentalsunited_property_id
  );