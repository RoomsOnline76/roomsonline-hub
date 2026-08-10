-- 1. Compact booking reference format: ROL-<PROP>-<NNNN>
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS rol_reference_legacy text;

CREATE OR REPLACE FUNCTION public.format_rol_booking_reference(_code text, _seq integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT 'ROL-' || upper(coalesce(nullif(_code, ''), 'PRP')) || '-' || lpad(_seq::text, 4, '0');
$$;

CREATE OR REPLACE FUNCTION public.next_rol_booking_reference(_property_id uuid, _origin text, _kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  code text;
  seq integer;
BEGIN
  SELECT ref_code INTO code FROM public.properties WHERE id = _property_id;
  IF code IS NULL OR code = '' THEN
    code := coalesce(substr(replace(_property_id::text, '-', ''), 1, 3), 'PRP');
  END IF;

  INSERT INTO public.booking_reference_counters (property_id, last_seq)
  VALUES (_property_id, 1)
  ON CONFLICT (property_id) DO UPDATE SET last_seq = public.booking_reference_counters.last_seq + 1
  RETURNING last_seq INTO seq;

  RETURN public.format_rol_booking_reference(code, seq);
END;
$function$;

-- Backfill existing bookings: keep the running number, keep the old code for lookups
UPDATE public.bookings b
SET rol_reference_legacy = COALESCE(b.rol_reference_legacy, b.rol_reference),
    rol_reference = public.format_rol_booking_reference(
      split_part(b.rol_reference, '-', 4),
      NULLIF(split_part(b.rol_reference, '-', 5), '')::integer
    )
WHERE b.rol_reference ~ '^ROL-[A-Z0-9]{2,4}-[BR]-[A-Z0-9]{2,4}-[0-9]{4,}$';

-- 2. Journey (itinerary) references: ROL-TRIP-<NNNN>
ALTER TABLE public.itineraries ADD COLUMN IF NOT EXISTS rol_reference text;

CREATE TABLE IF NOT EXISTS public.itinerary_reference_counters (
  scope text PRIMARY KEY,
  last_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.itinerary_reference_counters TO authenticated;
GRANT ALL ON public.itinerary_reference_counters TO service_role;
ALTER TABLE public.itinerary_reference_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'itinerary_reference_counters'
      AND policyname = 'Staff can view itinerary reference counters'
  ) THEN
    CREATE POLICY "Staff can view itinerary reference counters"
      ON public.itinerary_reference_counters
      FOR SELECT
      TO authenticated
      USING (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'dev')
        OR public.has_role(auth.uid(), 'fearless_leader')
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.next_rol_itinerary_reference()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  seq integer;
BEGIN
  INSERT INTO public.itinerary_reference_counters (scope, last_seq)
  VALUES ('trip', 1)
  ON CONFLICT (scope) DO UPDATE SET last_seq = public.itinerary_reference_counters.last_seq + 1, updated_at = now()
  RETURNING last_seq INTO seq;

  RETURN 'ROL-TRIP-' || lpad(seq::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_rol_itinerary_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.rol_reference IS NULL OR NEW.rol_reference = '' THEN
    NEW.rol_reference := public.next_rol_itinerary_reference();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assign_rol_itinerary_reference_trg ON public.itineraries;
CREATE TRIGGER assign_rol_itinerary_reference_trg
BEFORE INSERT ON public.itineraries
FOR EACH ROW EXECUTE FUNCTION public.assign_rol_itinerary_reference();

-- Backfill existing itineraries in creation order
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.itineraries
  WHERE rol_reference IS NULL OR rol_reference = ''
)
UPDATE public.itineraries i
SET rol_reference = 'ROL-TRIP-' || lpad(o.rn::text, 4, '0')
FROM ordered o
WHERE i.id = o.id;

INSERT INTO public.itinerary_reference_counters (scope, last_seq)
VALUES ('trip', (SELECT count(*)::integer FROM public.itineraries))
ON CONFLICT (scope) DO UPDATE SET last_seq = GREATEST(public.itinerary_reference_counters.last_seq, EXCLUDED.last_seq), updated_at = now();

CREATE UNIQUE INDEX IF NOT EXISTS itineraries_rol_reference_key ON public.itineraries (rol_reference);
CREATE INDEX IF NOT EXISTS bookings_rol_reference_legacy_idx ON public.bookings (rol_reference_legacy);