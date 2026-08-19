-- Channel sync safety net: every booking change enqueues a channel booking sync job.
-- The trigger only enqueues (never calls out), so booking writes stay fast.

CREATE OR REPLACE FUNCTION public.enqueue_channel_booking_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      -- Only fields the channel's reservation record or inventory depends on.
      IF NEW.status IS DISTINCT FROM OLD.status
         AND lower(COALESCE(NEW.status, '')) IN ('cancelled', 'canceled', 'no_show', 'rejected', 'declined') THEN
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
      ELSIF NEW.amount_paid IS DISTINCT FROM OLD.amount_paid THEN
        _change := 'payment';
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

  -- The interactive surfaces push immediately; do not queue a duplicate right behind a
  -- successful push made moments ago.
  SELECT EXISTS (
    SELECT 1 FROM public.booking_sync_status s
     WHERE s.booking_id = _booking_id
       AND s.external_system = 'rentalsunited'
       AND s.sync_status = 'synced'
       AND s.last_action_at > now() - interval '90 seconds'
  ) INTO _recent;

  IF _recent AND _change <> 'cancelled' THEN
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
$$;

DROP TRIGGER IF EXISTS trg_bookings_channel_sync ON public.bookings;
CREATE TRIGGER trg_bookings_channel_sync
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enqueue_channel_booking_sync();

DROP TRIGGER IF EXISTS trg_booking_rooms_channel_sync ON public.rolos_booking_rooms;
CREATE TRIGGER trg_booking_rooms_channel_sync
AFTER INSERT OR UPDATE OR DELETE ON public.rolos_booking_rooms
FOR EACH ROW EXECUTE FUNCTION public.enqueue_channel_booking_sync();