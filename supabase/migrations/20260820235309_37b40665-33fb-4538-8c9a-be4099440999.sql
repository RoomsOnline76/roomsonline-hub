DO $$
DECLARE
  src_prop uuid := '700a9471-6c1d-4ad5-b889-1f3c71a0e9fc';
  src_rt   uuid := 'e3997fa3-f64c-4846-b364-4825c4d9020a';
  src_plan uuid := '5413f025-a0fe-43e3-9ffc-af473ec80d52';
  new_prop uuid := '4b1e0a10-0000-4000-8000-000000000002';
  new_plan uuid := '4b1e0a10-0000-4000-8000-000000000005';
  new_rt   uuid;
  s RECORD;
  new_season uuid;
  rate numeric;
BEGIN
  SELECT linked_rolos_id INTO new_rt FROM public.hostfully_room_types
  WHERE id = '4b1e0a10-0000-4000-8000-000000000003';

  FOR s IN
    SELECT * FROM public.rolos_shared_seasons
    WHERE property_id = src_prop AND deleted_at IS NULL
    ORDER BY start_date
  LOOP
    -- Rate for this season name on the copied unit, from the source plan.
    SELECT sr.base_rate INTO rate
    FROM public.rolos_rate_plan_season_rates sr
    JOIN public.rolos_shared_seasons ss ON ss.id = sr.shared_season_id
    WHERE sr.rate_plan_id = src_plan
      AND sr.deleted_at IS NULL
      AND sr.room_type_id = src_rt
      AND ss.name = s.name
    LIMIT 1;

    IF rate IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.rolos_shared_seasons
      (property_id, name, start_date, end_date, is_peak, source, calendar_season_id, is_active)
    VALUES (new_prop, s.name, s.start_date, s.end_date, s.is_peak, s.source, s.calendar_season_id, true)
    RETURNING id INTO new_season;

    INSERT INTO public.rolos_rate_plan_season_rates
      (rate_plan_id, shared_season_id, room_type_id, base_rate, differential_type, is_active)
    VALUES (new_plan, new_season, new_rt, rate, 'none', true)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;