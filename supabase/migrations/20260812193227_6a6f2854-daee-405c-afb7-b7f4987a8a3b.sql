UPDATE public.properties p
SET ru_image_tags = COALESCE(p.ru_image_tags, '{}'::jsonb) || jsonb_build_object(f.url, '[1]'::jsonb)
FROM (
  SELECT id, (images -> 0 ->> 'url') AS url
  FROM public.properties
  WHERE jsonb_typeof(images) = 'array' AND jsonb_array_length(images) > 0
    AND jsonb_typeof(images -> 0) = 'object'
) AS f
WHERE p.id = f.id AND f.url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_each(COALESCE(p.ru_image_tags, '{}'::jsonb)) AS e(key, val),
      jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.val)='array' THEN e.val ELSE '[]'::jsonb END) AS t(x)
    WHERE t.x = '1'
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.images) AS img
    WHERE (img ->> 'is_main')::text = 'true' OR (img ->> 'is_hero')::text = 'true' OR img ->> 'type' = 'hero'
  );

UPDATE public.hostfully_room_types r
SET ru_image_tags = COALESCE(r.ru_image_tags, '{}'::jsonb) || jsonb_build_object(f.url, '[1]'::jsonb)
FROM (
  SELECT id, (images -> 0 ->> 'url') AS url
  FROM public.hostfully_room_types
  WHERE jsonb_typeof(images) = 'array' AND jsonb_array_length(images) > 0
    AND jsonb_typeof(images -> 0) = 'object'
) AS f
WHERE r.id = f.id AND f.url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_each(COALESCE(r.ru_image_tags, '{}'::jsonb)) AS e(key, val),
      jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.val)='array' THEN e.val ELSE '[]'::jsonb END) AS t(x)
    WHERE t.x = '1'
  )
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r.images) AS img
    WHERE (img ->> 'is_main')::text = 'true' OR (img ->> 'is_hero')::text = 'true' OR img ->> 'type' = 'hero'
  );