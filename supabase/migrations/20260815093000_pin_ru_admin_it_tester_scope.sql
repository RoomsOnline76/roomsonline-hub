-- Pin ru-admin@roomsonline.co.za to Seesig + Tidal only.
-- The original seed used a hardcoded auth user id that can drift; resolve by email.

INSERT INTO public.scoped_admin_properties (user_id, property_id)
SELECT u.id, p.id
FROM auth.users u
CROSS JOIN public.properties p
WHERE lower(u.email) = 'ru-admin@roomsonline.co.za'
  AND p.is_active = true
  AND (
    p.id IN (
      '76f524f3-8229-4097-b45d-18489f897195',
      'af57b357-9c95-47f5-b7d5-43d3b2f05bb7'
    )
    OR p.name ILIKE '%seesig%'
    OR p.name ILIKE '%tidal%'
  )
ON CONFLICT (user_id, property_id) DO NOTHING;

DELETE FROM public.scoped_admin_properties s
USING auth.users u
WHERE s.user_id = u.id
  AND lower(u.email) = 'ru-admin@roomsonline.co.za'
  AND s.property_id NOT IN (
    SELECT p.id
    FROM public.properties p
    WHERE p.id IN (
      '76f524f3-8229-4097-b45d-18489f897195',
      'af57b357-9c95-47f5-b7d5-43d3b2f05bb7'
    )
    OR p.name ILIKE '%seesig%'
    OR p.name ILIKE '%tidal%'
  );
