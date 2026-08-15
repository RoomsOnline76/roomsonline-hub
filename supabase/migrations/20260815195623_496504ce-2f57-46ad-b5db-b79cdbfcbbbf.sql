DO $mig$
DECLARE
  src_ids uuid[] := ARRAY[
    'a22384f0-749f-4c48-add5-efd6103caf25'::uuid, -- Dassiesingel
    '00015d06-a9cb-4e82-a62e-a7685e5d7c33'::uuid, -- Fonteinhutte
    '76f524f3-8229-4097-b45d-18489f897195'::uuid, -- Seesig
    'af57b357-9c95-47f5-b7d5-43d3b2f05bb7'::uuid  -- Tidal Pools
  ];
  sid uuid;
  nid uuid;
  i int;
  j int;
  tbl text;
  filt text;
  inl text;
  parts text[];
  pair text[];
  ov text;
  -- [table, row filter, inline remaps as "col:ref_table" list]
  specs text[][] := ARRAY[
    ARRAY['rolos_rooms',                  $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties,room_type_id:rolos_room_types'],
    ARRAY['property_charges',             $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_reservation_policies',   $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_policies',               $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['property_specials',            $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['promo_codes',                  $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['property_partner_offers',      $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_message_templates',      $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_brand_config',           $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_experience_configs',     $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_tax_rules',              $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['local_experiences',            $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['property_rates',               $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['property_contact_details',     $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['property_commercial_terms',    $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['property_bank_details',        $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['property_billing_configs',     $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['property_contracts',           $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['property_owners',              $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_event_spaces',           $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_shared_seasons',         $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_pricing_rules',          $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_ui_configs',             $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_channel_connections',    $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_yield_rules',            $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties'],
    ARRAY['rolos_rate_plans',             $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties,breakfast_charge_id:property_charges'],
    ARRAY['rolos_rate_seasons',           $$rate_plan_id IN (SELECT old_id FROM _cmap WHERE tbl='rolos_rate_plans')$$, 'rate_plan_id:rolos_rate_plans'],
    ARRAY['rolos_stay_restrictions',      $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties,rate_plan_id:rolos_rate_plans,room_type_id:rolos_room_types'],
    ARRAY['rolos_rate_plan_stop_sell',    $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties,rate_plan_id:rolos_rate_plans'],
    ARRAY['rolos_rate_plan_room_types',   $$rate_plan_id IN (SELECT old_id FROM _cmap WHERE tbl='rolos_rate_plans')$$, 'rate_plan_id:rolos_rate_plans,room_type_id:rolos_room_types'],
    ARRAY['rolos_rate_plan_season_rates', $$rate_plan_id IN (SELECT old_id FROM _cmap WHERE tbl='rolos_rate_plans')$$, 'rate_plan_id:rolos_rate_plans,room_type_id:rolos_room_types,legacy_season_id:rolos_rate_seasons,shared_season_id:rolos_shared_seasons'],
    ARRAY['rolos_rate_prices',            $$season_id IN (SELECT old_id FROM _cmap WHERE tbl='rolos_rate_seasons') OR room_type_id IN (SELECT old_id FROM _cmap WHERE tbl='rolos_room_types')$$, 'season_id:rolos_rate_seasons,room_type_id:rolos_room_types'],
    ARRAY['rolos_rate_strategies',        $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties,rate_plan_id:rolos_rate_plans,room_type_id:rolos_room_types,season_id:rolos_rate_seasons'],
    ARRAY['rolos_deposit_schedules',      $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties,rate_plan_id:rolos_rate_plans'],
    ARRAY['rolos_packages',               $$property_id IN (SELECT old_id FROM _cmap WHERE tbl='properties')$$, 'property_id:properties,base_rate_plan_id:rolos_rate_plans'],
    ARRAY['rolos_package_components',     $$package_id IN (SELECT old_id FROM _cmap WHERE tbl='rolos_packages')$$, 'package_id:rolos_packages'],
    ARRAY['rolos_policy_rate_links',      $$policy_id IN (SELECT old_id FROM _cmap WHERE tbl='rolos_reservation_policies')$$, 'policy_id:rolos_reservation_policies,rate_plan_id:rolos_rate_plans']
  ];
BEGIN
  CREATE TEMP TABLE _cmap(tbl text, old_id uuid, new_id uuid) ON COMMIT DROP;

  -- 1. Property records
  FOREACH sid IN ARRAY src_ids LOOP
    nid := gen_random_uuid();
    INSERT INTO public.properties
    SELECT (jsonb_populate_record(NULL::public.properties,
      to_jsonb(p) || jsonb_build_object(
        'id', nid,
        'name', p.name || ' (Copy)',
        'slug', p.slug || '-copy',
        'ref_code', NULL,
        'is_active', true,
        'is_trading', false,
        'show_on_website', false,
        'ru_push_enabled', false,
        'ru_archived', false,
        'ru_archived_at', NULL,
        'external_id', NULL,
        'hostfully_property_uid', NULL,
        'checkfront_property_code', NULL,
        'benson_property_code', NULL,
        'hotelbeds_hotel_code', NULL,
        'siteminder_property_code', NULL,
        'littlehotelier_channel_code', NULL,
        'last_pms_sync_at', NULL,
        'pms_sync_status', NULL,
        'created_at', now(),
        'updated_at', now()
      ))).*
    FROM public.properties p WHERE p.id = sid;
    INSERT INTO _cmap(tbl, old_id, new_id) VALUES ('properties', sid, nid);
  END LOOP;

  -- 2. Room types: one current active record per unit name (sources hold historic duplicates)
  WITH src AS (
    SELECT DISTINCT ON (rt.property_id, lower(btrim(rt.name)))
           rt.*, gen_random_uuid() AS _nid, m.new_id AS _newprop
    FROM public.rolos_room_types rt
    JOIN _cmap m ON m.tbl = 'properties' AND m.old_id = rt.property_id
    WHERE rt.is_active
    ORDER BY rt.property_id, lower(btrim(rt.name)), rt.created_at DESC
  ), ins AS (
    INSERT INTO public.rolos_room_types
    SELECT (jsonb_populate_record(NULL::public.rolos_room_types,
      (to_jsonb(s) - '_nid' - '_newprop')
      || jsonb_build_object('id', s._nid, 'property_id', s._newprop, 'linked_overview_id', NULL))).*
    FROM src s
  )
  INSERT INTO _cmap(tbl, old_id, new_id) SELECT 'rolos_room_types', s.id, s._nid FROM src s;

  -- 3. Everything else, parents already remapped at insert time
  FOR i IN 1 .. array_length(specs, 1) LOOP
    tbl := specs[i][1];
    filt := '(' || specs[i][2] || ')';
    inl := specs[i][3];
    ov := $$jsonb_build_object('id', s._nid)$$;
    parts := string_to_array(inl, ',');
    FOR j IN 1 .. array_length(parts, 1) LOOP
      pair := string_to_array(parts[j], ':');
      ov := ov || format(
        $$ || jsonb_build_object(%1$L, (SELECT m.new_id FROM _cmap m WHERE m.tbl = %2$L AND m.old_id = s.%3$I))$$,
        pair[1], pair[2], pair[1]);
      -- skip rows pointing at a record that was not cloned (superseded duplicates)
      filt := filt || format(
        $$ AND (c.%1$I IS NULL OR EXISTS (SELECT 1 FROM _cmap m2 WHERE m2.tbl = %2$L AND m2.old_id = c.%1$I))$$,
        pair[1], pair[2]);
    END LOOP;

    EXECUTE format($q$
      WITH src AS (
        SELECT c.*, gen_random_uuid() AS _nid FROM public.%1$I c WHERE %2$s
      ), ins AS (
        INSERT INTO public.%1$I
        SELECT (jsonb_populate_record(NULL::public.%1$I, (to_jsonb(s) - '_nid') || %3$s)).*
        FROM src s
      )
      INSERT INTO _cmap(tbl, old_id, new_id) SELECT %1$L, s.id, s._nid FROM src s
    $q$, tbl, filt, ov);
  END LOOP;

  -- 4. Soft references resolved after the fact
  UPDATE public.rolos_reservation_policies p SET linked_master_id = m.new_id
  FROM _cmap self, _cmap m
  WHERE self.tbl = 'rolos_reservation_policies' AND self.new_id = p.id
    AND m.tbl = 'rolos_reservation_policies' AND m.old_id = p.linked_master_id;

  UPDATE public.rolos_reservation_policies p SET source_policy_id = m.new_id
  FROM _cmap self, _cmap m
  WHERE self.tbl = 'rolos_reservation_policies' AND self.new_id = p.id
    AND m.tbl = 'rolos_reservation_policies' AND m.old_id = p.source_policy_id;

  UPDATE public.property_specials sp SET cancellation_policy_id = m.new_id
  FROM _cmap self, _cmap m
  WHERE self.tbl = 'property_specials' AND self.new_id = sp.id
    AND m.tbl = 'rolos_reservation_policies' AND m.old_id = sp.cancellation_policy_id;

  -- 5. Portfolio detachment
  UPDATE public.rolos_rate_plans p SET portfolio_id = NULL
  FROM _cmap m WHERE m.tbl = 'rolos_rate_plans' AND m.new_id = p.id;
  UPDATE public.rolos_shared_seasons s SET portfolio_id = NULL
  FROM _cmap m WHERE m.tbl = 'rolos_shared_seasons' AND m.new_id = s.id;

  -- 6. Unit mirrors (created automatically by sync_rolos_to_overview_room_types)
  UPDATE public.hostfully_room_types dst
  SET description = src.description,
      max_guests = src.max_guests,
      daily_rate = src.daily_rate,
      amenities = src.amenities,
      images = src.images,
      is_active = src.is_active,
      ru_image_tags = src.ru_image_tags
  FROM _cmap m
  JOIN public.hostfully_room_types src ON src.property_id = m.old_id
  WHERE m.tbl = 'properties'
    AND dst.property_id = m.new_id
    AND lower(btrim(dst.name)) = lower(btrim(src.name));

  UPDATE public.hostfully_room_types dst
  SET hostfully_room_id = NULL, rentalsunited_property_id = NULL
  FROM _cmap m
  WHERE m.tbl = 'properties' AND dst.property_id = m.new_id;

  UPDATE public.rolos_room_types rt SET linked_overview_id = h.id
  FROM _cmap m
  JOIN public.hostfully_room_types h ON h.property_id = m.new_id
  WHERE m.tbl = 'properties'
    AND rt.property_id = m.new_id
    AND lower(btrim(rt.name)) = lower(btrim(h.name));

  -- 7. Channel connections: keep intent, clear identifiers and state
  UPDATE public.rolos_channel_connections c
  SET status = COALESCE((
        SELECT e.enumlabel::public.channel_connection_status
        FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid
        WHERE ty.typname = 'channel_connection_status'
          AND e.enumlabel IN ('disconnected','not_connected','pending','inactive','disabled')
        ORDER BY array_position(ARRAY['disconnected','not_connected','pending','inactive','disabled'], e.enumlabel)
        LIMIT 1), c.status),
      credentials = '{}'::jsonb,
      last_sync_at = NULL
  FROM _cmap m WHERE m.tbl = 'rolos_channel_connections' AND m.new_id = c.id;

  -- 8. Contracts as unsigned drafts
  UPDATE public.property_contracts pc
  SET status = 'draft',
      signed_at = NULL, signed_by_name = NULL, signed_by_email = NULL,
      signed_by_designation = NULL, sent_at = NULL, sent_to_email = NULL,
      signing_token = NULL, token_expires_at = NULL
  FROM _cmap m WHERE m.tbl = 'property_contracts' AND m.new_id = pc.id;

  -- 9. Billing: configuration kept, live subscription state cleared
  UPDATE public.property_billing_configs bc
  SET mandate_status = NULL, mandate_token = NULL, last_invoice_id = NULL,
      last_auto_charge_status = NULL, cloudflare_custom_hostname_id = NULL,
      white_label_domain_status = DEFAULT, white_label_domain_verified_at = NULL
  FROM _cmap m WHERE m.tbl = 'property_billing_configs' AND m.new_id = bc.id;

  DELETE FROM public.subscription_charge_items sci
  USING _cmap m
  WHERE m.tbl = 'properties' AND sci.property_id = m.new_id;

  UPDATE public.properties p SET ru_push_enabled = false
  FROM _cmap m WHERE m.tbl = 'properties' AND m.new_id = p.id;

  RAISE NOTICE 'cloned rows: %', (SELECT count(*) FROM _cmap);
END $mig$;