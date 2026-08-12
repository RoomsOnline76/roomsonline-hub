DO $$
DECLARE
  keep_row record;
  duplicate_row record;
BEGIN
  FOR keep_row IN
    SELECT property_id, code, min(id::text)::uuid AS keep_id
    FROM public.rolos_rate_plans
    WHERE deleted_at IS NULL AND code IS NOT NULL
    GROUP BY property_id, code
    HAVING count(*) > 1
  LOOP
    FOR duplicate_row IN
      SELECT id
      FROM public.rolos_rate_plans
      WHERE property_id = keep_row.property_id
        AND code = keep_row.code
        AND deleted_at IS NULL
        AND id <> keep_row.keep_id
    LOOP
      UPDATE public.rolos_rate_plan_room_types
      SET rate_plan_id = keep_row.keep_id
      WHERE rate_plan_id = duplicate_row.id
        AND NOT EXISTS (
          SELECT 1 FROM public.rolos_rate_plan_room_types existing
          WHERE existing.rate_plan_id = keep_row.keep_id
            AND existing.room_type_id = public.rolos_rate_plan_room_types.room_type_id
        );
      DELETE FROM public.rolos_rate_plan_room_types WHERE rate_plan_id = duplicate_row.id;
      UPDATE public.rolos_rate_plans
      SET is_active = false, deleted_at = now(), updated_at = now()
      WHERE id = duplicate_row.id;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS rolos_rate_plans_property_code_active_uidx
ON public.rolos_rate_plans(property_id, code)
WHERE deleted_at IS NULL AND code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_overview_rates_to_rolos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _rate jsonb;
  _rate_id text;
  _plan_id uuid;
  _syncing text;
  _rate_code text;
BEGIN
  _syncing := current_setting('app.syncing_rate_plans', true);
  IF _syncing = 'true' THEN RETURN NEW; END IF;
  IF NOT coalesce(NEW.is_rol_property, false) THEN RETURN NEW; END IF;
  IF NEW.amenities->'pms_rate_types' IS NULL THEN RETURN NEW; END IF;

  PERFORM set_config('app.syncing_rate_plans', 'true', true);

  FOR _rate IN SELECT * FROM jsonb_array_elements(NEW.amenities->'pms_rate_types')
  LOOP
    _rate_id := _rate->>'id';
    _rate_code := left(coalesce(_rate_id, ''), 20);
    _plan_id := NULL;

    IF _rate_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      SELECT id INTO _plan_id
      FROM public.rolos_rate_plans
      WHERE property_id = NEW.id AND id = _rate_id::uuid
      LIMIT 1;
    END IF;

    IF _plan_id IS NULL AND _rate_code <> '' THEN
      SELECT id INTO _plan_id
      FROM public.rolos_rate_plans
      WHERE property_id = NEW.id AND code = _rate_code AND deleted_at IS NULL
      LIMIT 1;
    END IF;

    IF _plan_id IS NULL AND (_rate_id LIKE 'wizard-%' OR _rate_id LIKE 'manual-%') THEN
      SELECT id INTO _plan_id
      FROM public.rolos_rate_plans
      WHERE property_id = NEW.id
        AND lower(name) = lower(coalesce(_rate->>'name', ''))
        AND deleted_at IS NULL
      ORDER BY created_at
      LIMIT 1;
    END IF;

    IF _plan_id IS NOT NULL THEN
      UPDATE public.rolos_rate_plans SET
        name = coalesce(_rate->>'name', name),
        code = coalesce(nullif(_rate_code, ''), code),
        description = nullif(_rate->>'description', ''),
        base_rate = coalesce(nullif(_rate->>'baseRate', '')::numeric, base_rate),
        pricing_model = coalesce(nullif(_rate->>'pricingModel', ''), nullif(_rate->>'priceType', ''), pricing_model),
        min_stay = coalesce(nullif(_rate->>'minStayDays', '')::integer, min_stay),
        is_active = true,
        deleted_at = NULL,
        updated_at = now()
      WHERE id = _plan_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  target_property constant uuid := '76f524f3-8229-4097-b45d-18489f897195';
  authored jsonb;
  authored_ids uuid[];
BEGIN
  SELECT coalesce(amenities->'room_types', '[]'::jsonb)
  INTO authored
  FROM public.properties
  WHERE id = target_property;

  SELECT coalesce(array_agg((entry->>'id')::uuid), ARRAY[]::uuid[])
  INTO authored_ids
  FROM jsonb_array_elements(authored) entry
  WHERE coalesce(entry->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  UPDATE public.hostfully_room_types
  SET is_active = false, updated_at = now()
  WHERE property_id = target_property
    AND is_active IS DISTINCT FROM false
    AND id <> ALL(authored_ids);

  UPDATE public.rolos_rate_plan_room_types links
  SET is_active = false, deleted_at = now()
  WHERE links.room_type_id IN (
    SELECT linked_rolos_id
    FROM public.hostfully_room_types
    WHERE property_id = target_property
      AND is_active = false
      AND linked_rolos_id IS NOT NULL
  )
    AND links.is_active IS DISTINCT FROM false;
END $$;