-- Properties: flag first gallery photo as Main (RU tag 1) where no photo is flagged.
UPDATE public.properties p
SET ru_image_tags = COALESCE(p.ru_image_tags, '{}'::jsonb) || jsonb_build_object(
      first_url.url,
      to_jsonb(ARRAY[1] || COALESCE(
        (SELECT array_agg(x::int) FROM jsonb_array_elements_text(COALESCE(p.ru_image_tags -> first_url.url, '[]'::jsonb)) AS t(x) WHERE x::int <> 1),
        ARRAY[]::int[]
      ))
    )
FROM (
  SELECT id, (images ->> 0) AS url
  FROM public.properties
  WHERE jsonb_typeof(images) = 'array' AND jsonb_array_length(images) > 0
) AS first_url
WHERE p.id = first_url.id
  AND first_url.url IS NOT NULL
  AND left(first_url.url, 1) <> '{'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each(COALESCE(p.ru_image_tags, '{}'::jsonb)) AS e(key, val),
         jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.val) = 'array' THEN e.val ELSE '[]'::jsonb END) AS t(x)
    WHERE t.x = '1'
  );

-- Unit / room types: same backfill.
UPDATE public.hostfully_room_types r
SET ru_image_tags = COALESCE(r.ru_image_tags, '{}'::jsonb) || jsonb_build_object(
      first_url.url,
      to_jsonb(ARRAY[1] || COALESCE(
        (SELECT array_agg(x::int) FROM jsonb_array_elements_text(COALESCE(r.ru_image_tags -> first_url.url, '[]'::jsonb)) AS t(x) WHERE x::int <> 1),
        ARRAY[]::int[]
      ))
    )
FROM (
  SELECT id, (images ->> 0) AS url
  FROM public.hostfully_room_types
  WHERE jsonb_typeof(images) = 'array' AND jsonb_array_length(images) > 0
) AS first_url
WHERE r.id = first_url.id
  AND first_url.url IS NOT NULL
  AND left(first_url.url, 1) <> '{'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each(COALESCE(r.ru_image_tags, '{}'::jsonb)) AS e(key, val),
         jsonb_array_elements_text(CASE WHEN jsonb_typeof(e.val) = 'array' THEN e.val ELSE '[]'::jsonb END) AS t(x)
    WHERE t.x = '1'
  );