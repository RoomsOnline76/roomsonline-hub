CREATE OR REPLACE FUNCTION public.enqueue_channel_booking_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _booking_id uuid;
  _change text;
  _previous jsonb := '{}'::jsonb;
  _recent boolean;
BEGIN
  IF TG_TABLE_NAME = 'rolos_booking_rooms' THEN
    _booking_id := COALESCE(NEW.booking_id, OLD.booking_id);
    -- A room line rewritten with identical sellable values (exactly what the 30-minute
    -- channel pull does when it re-ingests an unchanged stay) must not enqueue an outbound
    -- push: that loop produced a reservation read plus an ARI push every half hour forever.
    IF TG_OP = 'UPDATE' THEN
      IF NEW.room_id IS NOT DISTINCT FROM OLD.room_id
         AND NEW.room_type_id IS NOT DISTINCT FROM OLD.room_type_id
         AND NEW.adults IS NOT DISTINCT FROM OLD.adults
         AND NEW.children IS NOT DISTINCT FROM OLD.children
         AND NEW.teens IS NOT DISTINCT FROM OLD.teens
         AND NEW.infants IS NOT DISTINCT FROM OLD.infants
         AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN COALESCE(NEW, OLD);
      END IF;
    END IF;
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
      ELSIF NEW.status IS DISTINCT FROM OLD.status
         AND lower(COALESCE(NEW.status, '')) IN ('checked_in', 'in_house', 'checked_out', 'departed', 'completed', 'confirmed', 'guaranteed') THEN
        RETURN COALESCE(NEW, OLD);
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

  -- A write that the channel ingest itself just made must not bounce straight back out as an
  -- outbound push. The window must comfortably cover the job's own 45-second delay and the
  -- multi-step ingest write, hence 5 minutes rather than 90 seconds.
  SELECT EXISTS (
    SELECT 1 FROM public.booking_sync_status s
     WHERE s.booking_id = _booking_id
       AND s.external_system = 'rentalsunited'
       AND s.sync_status = 'synced'
       AND s.last_action_at > now() - interval '5 minutes'
  ) INTO _recent;

  IF _recent THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.background_jobs (job_type, dedupe_key, payload, run_after, max_attempts)
  VALUES (
    'channel_booking_sync',
    'channel_booking_sync:' || _booking_id::text || ':' || _change,
    jsonb_build_object('booking_id', _booking_id, 'change', _change, 'previous', _previous),
    now() + interval '45 seconds',
    5
  )
  ON CONFLICT DO NOTHING;

  RETURN COALESCE(NEW, OLD);
END;
$function$;