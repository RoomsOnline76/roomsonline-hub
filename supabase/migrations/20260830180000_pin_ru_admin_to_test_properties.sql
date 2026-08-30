-- Pin ru-admin@roomsonline.co.za to the RU test properties only:
-- Pufferfish, Sealion, Leopard, Albatros.
-- Existing pins (Seesig + Tidal, one-off copies) are dropped only after at
-- least one of those test properties is actually assigned, so a name miss
-- cannot leave the tester unrestricted.

INSERT INTO public.scoped_admin_properties (user_id, property_id)
SELECT u.id, p.id
FROM auth.users u
CROSS JOIN public.properties p
WHERE lower(u.email) = 'ru-admin@roomsonline.co.za'
  AND p.permanently_deleted_at IS NULL
  AND (
    p.id IN (
      '2f5d0f79-3763-42fd-87a9-5c20ab36cb32', -- Pufferfish
      '0079ba7c-8196-461d-af10-4f8bb0c15896'  -- Albatros
    )
    OR p.name ILIKE '%pufferfish%'
    OR p.name ILIKE '%sealion%'
    OR p.name ILIKE '%sea lion%'
    OR p.name ILIKE '%seaslion%'
    OR p.name ILIKE '%leopard%'
    OR p.name ILIKE '%albatros%'
  )
ON CONFLICT (user_id, property_id) DO NOTHING;

DELETE FROM public.scoped_admin_properties s
USING auth.users u
WHERE s.user_id = u.id
  AND lower(u.email) = 'ru-admin@roomsonline.co.za'
  AND s.property_id NOT IN (
    SELECT p.id
    FROM public.properties p
    WHERE p.permanently_deleted_at IS NULL
      AND (
        p.id IN (
          '2f5d0f79-3763-42fd-87a9-5c20ab36cb32',
          '0079ba7c-8196-461d-af10-4f8bb0c15896'
        )
        OR p.name ILIKE '%pufferfish%'
        OR p.name ILIKE '%sealion%'
        OR p.name ILIKE '%sea lion%'
        OR p.name ILIKE '%seaslion%'
        OR p.name ILIKE '%leopard%'
        OR p.name ILIKE '%albatros%'
      )
  )
  AND EXISTS (
    SELECT 1
    FROM public.scoped_admin_properties keep
    JOIN public.properties p ON p.id = keep.property_id
    WHERE keep.user_id = u.id
      AND (
        p.id IN (
          '2f5d0f79-3763-42fd-87a9-5c20ab36cb32',
          '0079ba7c-8196-461d-af10-4f8bb0c15896'
        )
        OR p.name ILIKE '%pufferfish%'
        OR p.name ILIKE '%sealion%'
        OR p.name ILIKE '%sea lion%'
        OR p.name ILIKE '%seaslion%'
        OR p.name ILIKE '%leopard%'
        OR p.name ILIKE '%albatros%'
      )
  );
