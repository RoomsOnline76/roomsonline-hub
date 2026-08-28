CREATE TABLE IF NOT EXISTS public.ru_reservation_op_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  op text NOT NULL,
  fingerprint text NOT NULL,
  ru_property_id text,
  reservation_id text,
  outcome text NOT NULL DEFAULT 'in_flight',
  detail text,
  attempts integer NOT NULL DEFAULT 1,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ru_reservation_op_claims_unique UNIQUE (booking_id, op, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_ru_res_op_claims_booking ON public.ru_reservation_op_claims (booking_id, op);

GRANT SELECT ON public.ru_reservation_op_claims TO authenticated;
GRANT ALL ON public.ru_reservation_op_claims TO service_role;

ALTER TABLE public.ru_reservation_op_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view channel reservation op claims"
ON public.ru_reservation_op_claims
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
  OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = ru_reservation_op_claims.booking_id
      AND public.can_access_property(b.property_id, auth.uid())
  )
);

CREATE TRIGGER trg_ru_reservation_op_claims_updated_at
BEFORE UPDATE ON public.ru_reservation_op_claims
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();