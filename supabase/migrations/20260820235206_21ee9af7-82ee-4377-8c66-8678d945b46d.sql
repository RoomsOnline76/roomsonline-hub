-- RU IT blank-slate test property (copied from RU Test Clone B, single unit "Leervis")
DO $$
DECLARE
  src_prop uuid := '700a9471-6c1d-4ad5-b889-1f3c71a0e9fc';
  src_unit uuid := 'adfc256d-f009-4803-aa84-503a50a4d601';
  src_rt   uuid := 'e3997fa3-f64c-4846-b364-4825c4d9020a';
  src_plan uuid := '5413f025-a0fe-43e3-9ffc-af473ec80d52';
  new_portfolio uuid := '4b1e0a10-0000-4000-8000-000000000001';
  new_prop      uuid := '4b1e0a10-0000-4000-8000-000000000002';
  new_unit      uuid := '4b1e0a10-0000-4000-8000-000000000003';
  new_rt        uuid := '4b1e0a10-0000-4000-8000-000000000004';
  new_plan      uuid := '4b1e0a10-0000-4000-8000-000000000005';
  tester uuid := 'c696495c-00f3-46c4-b4ab-ce9147e558b9'; -- ru-admin@roomsonline.co.za
  owner_id uuid := '3bc66c66-72ec-4062-b1df-7cae436486c8'; -- ru-testowner@roomsonline.co.za
  season RECORD;
  new_season uuid;
BEGIN
  -- Portfolio (deliberately without any ru_owner_accounts row)
  INSERT INTO public.property_portfolios (id, name, slug, owner_id, owner_email)
  VALUES (new_portfolio, 'RU IT – Test Portfolio', 'ru-it-test-portfolio', owner_id, 'ru-testowner@roomsonline.co.za');

  -- Property: full content copy with RU identity stripped
  INSERT INTO public.properties
  SELECT (jsonb_populate_record(NULL::public.properties, to_jsonb(p) || jsonb_build_object(
    'id', new_prop,
    'name', 'RU IT Blank Slate – Test Owner',
    'slug', 'ru-it-blank-slate-test-owner',
    'owner_id', owner_id,
    'owner_email', 'ru-testowner@roomsonline.co.za',
    'external_system', 'roomsonline',
    'is_active', true,
    'is_trading', true,
    'ru_push_enabled', true,
    'rentalsunited_property_id', NULL,
    'created_at', now(),
    'updated_at', now()
  ))).*
  FROM public.properties p WHERE p.id = src_prop;

  INSERT INTO public.property_portfolio_members (portfolio_id, property_id)
  VALUES (new_portfolio, new_prop);

  -- Unit (single), no channel listing id. The room-sync trigger creates the
  -- matching canonical room type and links it back.
  INSERT INTO public.hostfully_room_types
  SELECT (jsonb_populate_record(NULL::public.hostfully_room_types, to_jsonb(u) || jsonb_build_object(
    'id', new_unit,
    'property_id', new_prop,
    'linked_rolos_id', NULL,
    'hostfully_room_id', NULL,
    'rentalsunited_property_id', NULL,
    'created_at', now(), 'updated_at', now()
  ))).*
  FROM public.hostfully_room_types u WHERE u.id = src_unit;

  SELECT id INTO new_rt FROM public.rolos_room_types
  WHERE property_id = new_prop AND (linked_overview_id = new_unit OR linked_overview_id IS NULL)
  ORDER BY (linked_overview_id = new_unit) DESC LIMIT 1;

  IF new_rt IS NULL THEN
    RAISE EXCEPTION 'Room type mirror was not created for the new unit';
  END IF;

  UPDATE public.rolos_room_types t SET
    description = s.description,
    max_occupancy = s.max_occupancy,
    default_rate = s.default_rate,
    amenities = s.amenities,
    images = s.images,
    is_active = true
  FROM public.rolos_room_types s
  WHERE t.id = new_rt AND s.id = src_rt;

  UPDATE public.hostfully_room_types SET linked_rolos_id = new_rt WHERE id = new_unit;

  -- Charges
  INSERT INTO public.property_charges
  SELECT (jsonb_populate_record(NULL::public.property_charges, to_jsonb(c) || jsonb_build_object(
    'id', gen_random_uuid(), 'property_id', new_prop, 'created_at', now(), 'updated_at', now()
  ))).*
  FROM public.property_charges c WHERE c.property_id = src_prop;

  -- Nearby attractions / points of interest
  INSERT INTO public.local_experiences
  SELECT (jsonb_populate_record(NULL::public.local_experiences, to_jsonb(e) || jsonb_build_object(
    'id', gen_random_uuid(), 'property_id', new_prop, 'created_at', now(), 'updated_at', now()
  ))).*
  FROM public.local_experiences e WHERE e.property_id = src_prop;

  -- Contact details
  INSERT INTO public.property_contact_details
  SELECT (jsonb_populate_record(NULL::public.property_contact_details, to_jsonb(d) || jsonb_build_object(
    'id', gen_random_uuid(), 'property_id', new_prop, 'created_at', now(), 'updated_at', now()
  ))).*
  FROM public.property_contact_details d WHERE d.property_id = src_prop;

  -- Rate plan + unit link
  INSERT INTO public.rolos_rate_plans
  SELECT (jsonb_populate_record(NULL::public.rolos_rate_plans, to_jsonb(rp) || jsonb_build_object(
    'id', new_plan, 'property_id', new_prop, 'created_at', now(), 'updated_at', now()
  ))).*
  FROM public.rolos_rate_plans rp WHERE rp.id = src_plan;

  INSERT INTO public.rolos_rate_plan_room_types (rate_plan_id, room_type_id, link_source, is_active, differential_type, sort_order)
  VALUES (new_plan, new_rt, 'rate_plan_configurator', true, 'none', 0);

  -- Seasons + season rates for the copied unit
  FOR season IN SELECT * FROM public.rolos_rate_seasons WHERE rate_plan_id = src_plan LOOP
    new_season := gen_random_uuid();
    INSERT INTO public.rolos_rate_seasons (id, rate_plan_id, name, start_date, end_date, day_of_week_multipliers, min_stay_override, is_peak)
    VALUES (new_season, new_plan, season.name, season.start_date, season.end_date, season.day_of_week_multipliers, season.min_stay_override, season.is_peak);

    INSERT INTO public.rolos_rate_plan_season_rates
      (rate_plan_id, legacy_season_id, room_type_id, base_rate, extra_adult_rate, extra_child_rate, differential_type, differential_value, is_active)
    SELECT new_plan, new_season, new_rt, sr.base_rate, sr.extra_adult_rate, sr.extra_child_rate, sr.differential_type, sr.differential_value, true
    FROM public.rolos_rate_plan_season_rates sr
    WHERE sr.rate_plan_id = src_plan
      AND sr.legacy_season_id = season.id
      AND sr.deleted_at IS NULL
      AND (sr.room_type_id = src_rt OR sr.room_type_id IS NULL)
    ORDER BY (sr.room_type_id = src_rt) DESC
    LIMIT 1;
  END LOOP;

  -- Tester scope: RU IT admin sees only this property
  DELETE FROM public.scoped_admin_properties WHERE user_id = tester;
  INSERT INTO public.scoped_admin_properties (user_id, property_id) VALUES (tester, new_prop);
END $$;