-- 1. Merge duplicate profiles (same property, same normalised name): keep the oldest.
WITH ranked AS (
  SELECT id, property_id,
         lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')) AS norm,
         row_number() OVER (
           PARTITION BY property_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS rn,
         first_value(id) OVER (
           PARTITION BY property_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS keep_id
  FROM public.rolos_guest_profiles
),
dupes AS (SELECT id, keep_id FROM ranked WHERE rn > 1)
UPDATE public.bookings b SET rolos_guest_id = d.keep_id
FROM dupes d WHERE b.rolos_guest_id = d.id;

WITH ranked AS (
  SELECT id, property_id,
         row_number() OVER (
           PARTITION BY property_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS rn,
         first_value(id) OVER (
           PARTITION BY property_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS keep_id
  FROM public.rolos_guest_profiles
),
dupes AS (SELECT id, keep_id FROM ranked WHERE rn > 1)
UPDATE public.rolos_guest_comments c SET guest_id = d.keep_id
FROM dupes d WHERE c.guest_id = d.id;

WITH ranked AS (
  SELECT id, property_id,
         row_number() OVER (
           PARTITION BY property_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS rn,
         first_value(id) OVER (
           PARTITION BY property_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS keep_id
  FROM public.rolos_guest_profiles
),
dupes AS (SELECT id, keep_id FROM ranked WHERE rn > 1)
UPDATE public.rolos_reservations r SET guest_id = d.keep_id
FROM dupes d WHERE r.guest_id = d.id;

WITH ranked AS (
  SELECT id, property_id,
         row_number() OVER (
           PARTITION BY property_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS rn,
         first_value(id) OVER (
           PARTITION BY property_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS keep_id
  FROM public.rolos_guest_profiles
),
dupes AS (SELECT id, keep_id FROM ranked WHERE rn > 1)
UPDATE public.rolos_waitlist w SET guest_id = d.keep_id
FROM dupes d WHERE w.guest_id = d.id;

WITH ranked AS (
  SELECT id, property_id,
         row_number() OVER (
           PARTITION BY property_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))
           ORDER BY created_at, id
         ) AS rn
  FROM public.rolos_guest_profiles
)
DELETE FROM public.rolos_guest_profiles p
USING ranked r WHERE p.id = r.id AND r.rn > 1;

-- 2. Normalised name + uniqueness per property.
ALTER TABLE public.rolos_guest_profiles
  ADD COLUMN IF NOT EXISTS normalised_name text
  GENERATED ALWAYS AS (lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS rolos_guest_profiles_property_norm_key
  ON public.rolos_guest_profiles (property_id, normalised_name);

CREATE INDEX IF NOT EXISTS idx_bookings_rolos_guest_id
  ON public.bookings (rolos_guest_id) WHERE rolos_guest_id IS NOT NULL;

-- 3. Stats rebuild helper: recompute stays / spend / last stay from bookings.
CREATE OR REPLACE FUNCTION public.rebuild_guest_stats(_guest_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  touched integer;
BEGIN
  WITH targets AS (
    SELECT p.id
    FROM public.rolos_guest_profiles p
    WHERE _guest_ids IS NULL OR p.id = ANY(_guest_ids)
  ),
  agg AS (
    SELECT t.id,
           count(b.id) AS stays,
           COALESCE(sum(COALESCE(b.total_price, 0)), 0) AS spent,
           max(b.check_in_date) AS last_stay
    FROM targets t
    LEFT JOIN public.bookings b
      ON b.rolos_guest_id = t.id
     AND COALESCE(b.status, '') NOT IN ('cancelled', 'no_show')
    GROUP BY t.id
  )
  UPDATE public.rolos_guest_profiles p
  SET total_stays = agg.stays,
      total_spent = agg.spent,
      last_stay_date = agg.last_stay,
      updated_at = now()
  FROM agg
  WHERE p.id = agg.id
    AND (p.total_stays IS DISTINCT FROM agg.stays
      OR p.total_spent IS DISTINCT FROM agg.spent
      OR p.last_stay_date IS DISTINCT FROM agg.last_stay);

  GET DIAGNOSTICS touched = ROW_COUNT;
  RETURN touched;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_guest_stats(uuid[]) TO authenticated, service_role;