CREATE TABLE public.channel_booking_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid,
  property_id uuid,
  unit_id uuid,
  direction text NOT NULL DEFAULT 'outbound',
  action text NOT NULL,
  source text,
  outcome text NOT NULL DEFAULT 'pushed',
  reason text,
  channel_reservation_id text,
  channel_listing_id text,
  channel_owner_id text,
  trace_id text,
  summary text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.channel_booking_events TO authenticated;
GRANT ALL ON public.channel_booking_events TO service_role;

ALTER TABLE public.channel_booking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform roles read all channel booking events"
ON public.channel_booking_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);

CREATE POLICY "Property members read their channel booking events"
ON public.channel_booking_events FOR SELECT TO authenticated
USING (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()));

CREATE INDEX idx_channel_booking_events_created_at ON public.channel_booking_events (created_at DESC);
CREATE INDEX idx_channel_booking_events_booking ON public.channel_booking_events (booking_id, created_at DESC);
CREATE INDEX idx_channel_booking_events_property ON public.channel_booking_events (property_id, created_at DESC);
CREATE INDEX idx_channel_booking_events_action ON public.channel_booking_events (direction, action, created_at DESC);

CREATE OR REPLACE FUNCTION public.enqueue_channel_booking_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _booking_id uuid;
  _change text;
  _previous jsonb := '{}'::jsonb;
  _recent boolean;
BEGIN
  IF TG_TABLE_NAME = 'rolos_booking_rooms' THEN
    _booking_id := COALESCE(NEW.booking_id, OLD.booking_id);
    _change := 'moved';
  ELSE
    _booking_id := COALESCE(NEW.id, OLD.id);

    IF TG_OP = 'INSERT' THEN
      _change := 'created';
    ELSIF TG_OP = 'DELETE' THEN
      _change := 'deleted';
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status
         AND lower(COALESCE(NEW.status, '')) IN ('no_show', 'noshow') THEN
        _change := 'no_show';
      ELSIF NEW.status IS DISTINCT FROM OLD.status
         AND lower(COALESCE(NEW.status, '')) IN ('cancelled', 'canceled', 'rejected', 'declined') THEN
        _change := 'cancelled';
      ELSIF NEW.check_in_date IS DISTINCT FROM OLD.check_in_date
         OR NEW.check_out_date IS DISTINCT FROM OLD.check_out_date THEN
        _change := 'dates';
      ELSIF NEW.room_type_id IS DISTINCT FROM OLD.room_type_id
         OR NEW.rolos_room_ids IS DISTINCT FROM OLD.rolos_room_ids THEN
        _change := 'moved';
      ELSIF NEW.adults IS DISTINCT FROM OLD.adults
         OR NEW.children IS DISTINCT FROM OLD.children
         OR NEW.teens IS DISTINCT FROM OLD.teens THEN
        _change := 'pax';
      ELSIF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        _change := 'price';
      ELSIF NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount THEN
        _change := 'deposit';
      ELSIF NEW.amount_paid IS DISTINCT FROM OLD.amount_paid THEN
        _change := 'payment';
      ELSIF NEW.special_requests IS DISTINCT FROM OLD.special_requests
         OR NEW.internal_notes IS DISTINCT FROM OLD.internal_notes
         OR NEW.modification_notes IS DISTINCT FROM OLD.modification_notes THEN
        _change := 'notes';
      ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        _change := 'status';
      ELSE
        RETURN COALESCE(NEW, OLD);
      END IF;

      _previous := jsonb_build_object(
        'room_type_id', OLD.room_type_id,
        'check_in_date', OLD.check_in_date,
        'check_out_date', OLD.check_out_date
      );
    END IF;
  END IF;

  IF _booking_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.booking_sync_status s
     WHERE s.booking_id = _booking_id
       AND s.external_system = 'rentalsunited'
       AND s.sync_status = 'synced'
       AND s.last_action_at > now() - interval '90 seconds'
  ) INTO _recent;

  IF _recent AND _change NOT IN ('cancelled', 'no_show') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.background_jobs (job_type, dedupe_key, payload, run_after, max_attempts)
  VALUES (
    'channel_booking_sync',
    'channel_booking_sync:' || _booking_id::text,
    jsonb_build_object('booking_id', _booking_id, 'change', _change, 'previous', _previous),
    now() + interval '45 seconds',
    5
  )
  ON CONFLICT DO NOTHING;

  RETURN COALESCE(NEW, OLD);
END;
$function$;