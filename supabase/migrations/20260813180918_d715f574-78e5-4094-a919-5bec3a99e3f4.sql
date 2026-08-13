ALTER TABLE public.rolos_guest_profiles
  ADD COLUMN IF NOT EXISTS total_received numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_outstanding numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cancelled_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_stays integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rolos_guest_profiles_active
  ON public.rolos_guest_profiles (property_id) WHERE NOT is_archived;

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
           count(b.id) FILTER (
             WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'no_show')
               AND b.check_in_date <= CURRENT_DATE
           ) AS stays,
           COALESCE(sum(COALESCE(b.amount_paid, 0)) FILTER (
             WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'no_show')
           ), 0) AS received,
           COALESCE(sum(GREATEST(COALESCE(b.total_price, 0) - COALESCE(b.amount_paid, 0), 0)) FILTER (
             WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'no_show')
           ), 0) AS outstanding,
           COALESCE(sum(COALESCE(b.total_price, 0)) FILTER (
             WHERE COALESCE(b.status, '') IN ('cancelled', 'no_show')
           ), 0) AS cancelled_value,
           count(b.id) FILTER (
             WHERE COALESCE(b.status, '') IN ('cancelled', 'no_show')
           ) AS cancelled_stays,
           max(b.check_in_date) FILTER (
             WHERE COALESCE(b.status, '') NOT IN ('cancelled', 'no_show')
               AND b.check_in_date <= CURRENT_DATE
           ) AS last_stay
    FROM targets t
    LEFT JOIN public.bookings b ON b.rolos_guest_id = t.id
    GROUP BY t.id
  )
  UPDATE public.rolos_guest_profiles p
  SET total_stays = agg.stays,
      total_received = agg.received,
      total_spent = agg.received,
      total_outstanding = agg.outstanding,
      total_cancelled_value = agg.cancelled_value,
      cancelled_stays = agg.cancelled_stays,
      last_stay_date = agg.last_stay,
      updated_at = now()
  FROM agg
  WHERE p.id = agg.id
    AND (p.total_stays IS DISTINCT FROM agg.stays
      OR p.total_received IS DISTINCT FROM agg.received
      OR p.total_spent IS DISTINCT FROM agg.received
      OR p.total_outstanding IS DISTINCT FROM agg.outstanding
      OR p.total_cancelled_value IS DISTINCT FROM agg.cancelled_value
      OR p.cancelled_stays IS DISTINCT FROM agg.cancelled_stays
      OR p.last_stay_date IS DISTINCT FROM agg.last_stay);

  GET DIAGNOSTICS touched = ROW_COUNT;
  RETURN touched;
END;
$$;

DROP POLICY IF EXISTS rolos_guest_profiles_update ON public.rolos_guest_profiles;
CREATE POLICY rolos_guest_profiles_update ON public.rolos_guest_profiles
FOR UPDATE TO authenticated
USING (
  is_property_owner(property_id, auth.uid())
  OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

DROP POLICY IF EXISTS rolos_guest_profiles_delete ON public.rolos_guest_profiles;
CREATE POLICY rolos_guest_profiles_delete ON public.rolos_guest_profiles
FOR DELETE TO authenticated
USING (
  is_property_owner(property_id, auth.uid())
  OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

SELECT public.rebuild_guest_stats(NULL);