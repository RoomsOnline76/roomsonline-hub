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
      SELECT id INTO _plan_id FROM public.rolos_rate_plans
      WHERE property_id = NEW.id AND id = _rate_id::uuid LIMIT 1;
    END IF;
    IF _plan_id IS NULL AND _rate_code <> '' THEN
      SELECT id INTO _plan_id FROM public.rolos_rate_plans
      WHERE property_id = NEW.id AND code = _rate_code AND deleted_at IS NULL LIMIT 1;
    END IF;
    IF _plan_id IS NULL AND (_rate_id LIKE 'wizard-%' OR _rate_id LIKE 'manual-%') THEN
      SELECT id INTO _plan_id FROM public.rolos_rate_plans
      WHERE property_id = NEW.id
        AND lower(name) = lower(coalesce(_rate->>'name', ''))
        AND deleted_at IS NULL
      ORDER BY created_at LIMIT 1;
    END IF;

    IF _plan_id IS NOT NULL THEN
      UPDATE public.rolos_rate_plans SET
        name = coalesce(_rate->>'name', name),
        code = coalesce(nullif(_rate_code, ''), code),
        description = nullif(_rate->>'description', ''),
        base_rate = coalesce(nullif(_rate->>'baseRate', '')::numeric, base_rate),
        pricing_model = coalesce(nullif(_rate->>'pricingModel', ''), nullif(_rate->>'priceType', ''), pricing_model),
        min_stay = coalesce(nullif(_rate->>'minStayDays', '')::integer, min_stay),
        max_stay = coalesce(nullif(_rate->>'maxStayDays', '')::integer, max_stay),
        min_advance_days = coalesce(nullif(_rate->>'minAdvanceDays', '')::integer, min_advance_days),
        max_advance_days = coalesce(nullif(_rate->>'maxAdvanceDays', '')::integer, max_advance_days),
        adult_1_rate = coalesce(nullif(_rate->>'adult1Rate', '')::numeric, adult_1_rate),
        adult_2_rate = coalesce(nullif(_rate->>'adult2Rate', '')::numeric, adult_2_rate),
        teen_rate = coalesce(nullif(_rate->>'teenRate', '')::numeric, teen_rate),
        child_rate = coalesce(nullif(_rate->>'childRate', '')::numeric, child_rate),
        infant_rate = coalesce(nullif(_rate->>'infantRate', '')::numeric, infant_rate),
        is_active = true,
        deleted_at = NULL,
        updated_at = now()
      WHERE id = _plan_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;