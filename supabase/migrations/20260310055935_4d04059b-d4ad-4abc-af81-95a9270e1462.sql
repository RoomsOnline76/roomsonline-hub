CREATE OR REPLACE FUNCTION public.sync_overview_rates_to_rolos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_rol boolean;
  _rate jsonb;
  _rate_id text;
  _existing_id uuid;
BEGIN
  IF current_setting('app.syncing_rate_plans', true) = 'true' THEN
    RETURN NEW;
  END IF;

  _is_rol := COALESCE(NEW.is_rol_property, false);
  IF NOT _is_rol THEN RETURN NEW; END IF;

  IF OLD.amenities IS NOT DISTINCT FROM NEW.amenities THEN RETURN NEW; END IF;
  IF (OLD.amenities->>'pms_rate_types') IS NOT DISTINCT FROM (NEW.amenities->>'pms_rate_types') THEN RETURN NEW; END IF;

  PERFORM set_config('app.syncing_rate_plans', 'true', true);

  FOR _rate IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.amenities->'pms_rate_types', '[]'::jsonb))
  LOOP
    _rate_id := _rate->>'id';
    
    SELECT id INTO _existing_id FROM rolos_rate_plans
    WHERE property_id = NEW.id AND (
      (id::text = _rate_id) OR
      (name = _rate->>'name' AND _rate_id LIKE 'wizard-%' OR _rate_id LIKE 'manual-%')
    )
    LIMIT 1;

    IF _existing_id IS NOT NULL THEN
      UPDATE rolos_rate_plans SET
        name = COALESCE(_rate->>'name', name),
        base_rate = CASE WHEN (_rate->>'baseRate') IS NOT NULL THEN (_rate->>'baseRate')::numeric ELSE base_rate END,
        description = COALESCE(NULLIF(_rate->>'description', ''), description),
        min_stay = CASE WHEN (_rate->>'minStayDays') IS NOT NULL THEN (_rate->>'minStayDays')::int ELSE min_stay END,
        max_stay = CASE WHEN (_rate->>'maxStayDays') IS NOT NULL THEN (_rate->>'maxStayDays')::int ELSE max_stay END,
        pricing_model = COALESCE(NULLIF(_rate->>'pricingModel', ''), pricing_model),
        adult_1_rate = CASE WHEN (_rate->>'adult1Rate') IS NOT NULL THEN (_rate->>'adult1Rate')::numeric ELSE adult_1_rate END,
        adult_2_rate = CASE WHEN (_rate->>'adult2Rate') IS NOT NULL THEN (_rate->>'adult2Rate')::numeric ELSE adult_2_rate END,
        teen_rate = CASE WHEN (_rate->>'teenRate') IS NOT NULL THEN (_rate->>'teenRate')::numeric ELSE teen_rate END,
        child_rate = CASE WHEN (_rate->>'childRate') IS NOT NULL THEN (_rate->>'childRate')::numeric ELSE child_rate END,
        infant_rate = CASE WHEN (_rate->>'infantRate') IS NOT NULL THEN (_rate->>'infantRate')::numeric ELSE infant_rate END,
        updated_at = now()
      WHERE id = _existing_id;
    ELSE
      INSERT INTO rolos_rate_plans (property_id, name, code, base_rate, description, min_stay, max_stay, pricing_model, is_active, adult_1_rate, adult_2_rate, teen_rate, child_rate, infant_rate)
      VALUES (
        NEW.id,
        COALESCE(_rate->>'name', 'New Rate'),
        lower(regexp_replace(COALESCE(_rate->>'name', 'new-rate'), '[^a-zA-Z0-9]', '-', 'g')),
        CASE WHEN (_rate->>'baseRate') IS NOT NULL THEN (_rate->>'baseRate')::numeric ELSE NULL END,
        _rate->>'description',
        COALESCE((_rate->>'minStayDays')::int, 1),
        COALESCE((_rate->>'maxStayDays')::int, 0),
        _rate->>'pricingModel',
        true,
        CASE WHEN (_rate->>'adult1Rate') IS NOT NULL THEN (_rate->>'adult1Rate')::numeric ELSE NULL END,
        CASE WHEN (_rate->>'adult2Rate') IS NOT NULL THEN (_rate->>'adult2Rate')::numeric ELSE NULL END,
        CASE WHEN (_rate->>'teenRate') IS NOT NULL THEN (_rate->>'teenRate')::numeric ELSE NULL END,
        CASE WHEN (_rate->>'childRate') IS NOT NULL THEN (_rate->>'childRate')::numeric ELSE NULL END,
        CASE WHEN (_rate->>'infantRate') IS NOT NULL THEN (_rate->>'infantRate')::numeric ELSE NULL END
      );
    END IF;
  END LOOP;

  PERFORM set_config('app.syncing_rate_plans', 'false', true);
  RETURN NEW;
END;
$function$;