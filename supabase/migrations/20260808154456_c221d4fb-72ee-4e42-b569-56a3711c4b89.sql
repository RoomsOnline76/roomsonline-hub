-- 1. Property short codes -------------------------------------------------
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS ref_code text;

CREATE OR REPLACE FUNCTION public.suggest_property_ref_code(_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  base text;
BEGIN
  base := upper(regexp_replace(coalesce(_name, ''), '[^A-Za-z0-9]', '', 'g'));
  IF length(base) = 0 THEN base := 'PRP'; END IF;
  RETURN rpad(left(base, 3), 3, 'X');
END;
$$;

DO $$
DECLARE
  r RECORD;
  candidate text;
  suffix int;
BEGIN
  FOR r IN SELECT id, name FROM public.properties WHERE ref_code IS NULL ORDER BY created_at NULLS LAST, id LOOP
    candidate := public.suggest_property_ref_code(r.name);
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM public.properties WHERE ref_code = candidate) LOOP
      candidate := left(public.suggest_property_ref_code(r.name), 2) || suffix::text;
      suffix := suffix + 1;
      IF suffix > 9 THEN
        candidate := left(public.suggest_property_ref_code(r.name), 1) || lpad(suffix::text, 2, '0');
      END IF;
      IF suffix > 99 THEN
        candidate := substr(replace(r.id::text, '-', ''), 1, 3);
      END IF;
    END LOOP;
    UPDATE public.properties SET ref_code = candidate WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS properties_ref_code_uidx ON public.properties (ref_code) WHERE ref_code IS NOT NULL;

-- 2. Booking reference columns -------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rol_reference text,
  ADD COLUMN IF NOT EXISTS rol_ref_origin text,
  ADD COLUMN IF NOT EXISTS rol_ref_kind text;

-- 3. Per-property counters -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_reference_counters (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  last_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.booking_reference_counters TO authenticated;
GRANT ALL ON public.booking_reference_counters TO service_role;
ALTER TABLE public.booking_reference_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view booking reference counters"
ON public.booking_reference_counters FOR SELECT TO authenticated
USING (public.can_access_property(property_id, auth.uid()));

CREATE TRIGGER update_booking_reference_counters_updated_at
BEFORE UPDATE ON public.booking_reference_counters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Origin / kind resolution -------------------------------------------
CREATE OR REPLACE FUNCTION public.rol_origin_code(_integration_type text, _booking_channel text, _origin_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  it text := lower(coalesce(_integration_type, ''));
  bc text := lower(coalesce(_booking_channel, ''));
BEGIN
  IF it LIKE 'rentalsunited%' OR bc LIKE 'rentals_united%' THEN RETURN 'RU'; END IF;
  IF it LIKE 'hyperguest%' THEN RETURN 'HG'; END IF;
  IF it LIKE 'hostfully%' THEN RETURN 'HF'; END IF;
  IF it LIKE 'benson%' OR it LIKE 'bed24%' OR it LIKE 'beds24%' THEN RETURN 'BEN'; END IF;
  IF it LIKE 'nightsbridge%' THEN RETURN 'NB'; END IF;
  IF it LIKE 'cloudbeds%' THEN RETURN 'CB'; END IF;
  IF it LIKE 'checkfront%' THEN RETURN 'CF'; END IF;
  IF it IN ('wordpress') OR bc IN ('wordpress') THEN RETURN 'EMB'; END IF;
  IF it IN ('embed', 'widget') OR bc IN ('embed', 'widget') THEN RETURN 'EMB'; END IF;
  IF bc LIKE '%itinerary%' OR bc LIKE '%journey%' OR it LIKE '%journey%' THEN RETURN 'JNY'; END IF;
  IF it = 'rol_marketplace' OR bc = 'marketplace' THEN RETURN 'WEB'; END IF;
  IF bc IN ('white_label', 'whitelabel') THEN RETURN 'WL'; END IF;
  IF bc IN ('manual', 'front_desk', 'walk_in', 'phone', 'email') THEN RETURN 'PMS'; END IF;
  IF it IN ('rolos', 'none', '') OR bc IN ('direct', 'legacy_direct') THEN RETURN 'WEB'; END IF;
  RETURN 'OTA';
END;
$$;

CREATE OR REPLACE FUNCTION public.rol_reference_kind(_origin_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN _origin_code IN ('WEB', 'WL', 'EMB', 'JNY', 'PMS') THEN 'B' ELSE 'R' END;
$$;

-- 5. Reference minting ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_rol_booking_reference(_property_id uuid, _origin text, _kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
  seq integer;
BEGIN
  SELECT ref_code INTO code FROM public.properties WHERE id = _property_id;
  IF code IS NULL THEN
    code := coalesce(substr(replace(_property_id::text, '-', ''), 1, 3), 'PRP');
  END IF;

  INSERT INTO public.booking_reference_counters (property_id, last_seq)
  VALUES (_property_id, 1)
  ON CONFLICT (property_id) DO UPDATE SET last_seq = public.booking_reference_counters.last_seq + 1
  RETURNING last_seq INTO seq;

  RETURN 'ROL-' || upper(_origin) || '-' || upper(_kind) || '-' || upper(code) || '-' || lpad(seq::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_rol_booking_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  origin_code text;
  kind_code text;
BEGIN
  IF NEW.rol_reference IS NOT NULL AND NEW.rol_reference <> '' THEN
    RETURN NEW;
  END IF;
  IF NEW.property_id IS NULL THEN
    RETURN NEW;
  END IF;

  origin_code := coalesce(nullif(NEW.rol_ref_origin, ''), public.rol_origin_code(NEW.integration_type, NEW.booking_channel, NEW.origin_type));
  kind_code := coalesce(nullif(NEW.rol_ref_kind, ''), public.rol_reference_kind(origin_code));

  NEW.rol_ref_origin := origin_code;
  NEW.rol_ref_kind := kind_code;
  NEW.rol_reference := public.next_rol_booking_reference(NEW.property_id, origin_code, kind_code);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_rol_booking_reference_trg ON public.bookings;
CREATE TRIGGER assign_rol_booking_reference_trg
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.assign_rol_booking_reference();

-- 6. Backfill existing bookings -----------------------------------------
WITH numbered AS (
  SELECT
    b.id,
    b.property_id,
    public.rol_origin_code(b.integration_type, b.booking_channel, b.origin_type) AS origin_code,
    row_number() OVER (PARTITION BY b.property_id ORDER BY b.created_at NULLS LAST, b.id) AS seq
  FROM public.bookings b
  WHERE b.rol_reference IS NULL AND b.property_id IS NOT NULL
)
UPDATE public.bookings b
SET rol_ref_origin = n.origin_code,
    rol_ref_kind = public.rol_reference_kind(n.origin_code),
    rol_reference = 'ROL-' || n.origin_code || '-' || public.rol_reference_kind(n.origin_code) || '-'
      || upper(coalesce(p.ref_code, substr(replace(n.property_id::text, '-', ''), 1, 3))) || '-'
      || lpad(n.seq::text, 5, '0')
FROM numbered n
JOIN public.properties p ON p.id = n.property_id
WHERE b.id = n.id;

INSERT INTO public.booking_reference_counters (property_id, last_seq)
SELECT property_id, count(*)::int
FROM public.bookings
WHERE rol_reference IS NOT NULL AND property_id IS NOT NULL
GROUP BY property_id
ON CONFLICT (property_id) DO UPDATE SET last_seq = GREATEST(public.booking_reference_counters.last_seq, EXCLUDED.last_seq);

-- 7. Indexes -------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS bookings_rol_reference_uidx ON public.bookings (rol_reference) WHERE rol_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_rol_reference_pattern_idx ON public.bookings (rol_reference text_pattern_ops);
CREATE INDEX IF NOT EXISTS bookings_rol_ref_origin_idx ON public.bookings (rol_ref_origin);