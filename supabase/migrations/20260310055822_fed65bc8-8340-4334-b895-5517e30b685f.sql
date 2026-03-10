CREATE OR REPLACE FUNCTION public.sync_rolos_rates_to_overview()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _is_rol boolean;
  _rate_types jsonb;
  _prop_id uuid;
BEGIN
  IF current_setting('app.syncing_rate_plans', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _prop_id := COALESCE(NEW.property_id, OLD.property_id);
  SELECT is_rol_property INTO _is_rol FROM properties WHERE id = _prop_id;
  IF NOT COALESCE(_is_rol, false) THEN RETURN COALESCE(NEW, OLD); END IF;

  PERFORM set_config('app.syncing_rate_plans', 'true', true);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', rp.id,
    'name', rp.name,
    'description', rp.description,
    'baseRate', rp.base_rate,
    'priceType', COALESCE(rp.pricing_model, 'per_room'),
    'pricingModel', COALESCE(rp.pricing_model, 'per_room'),
    'minStayDays', COALESCE(rp.min_stay, 1),
    'maxStayDays', COALESCE(rp.max_stay, 0),
    'minAdvanceDays', 0,
    'maxAdvanceDays', 0,
    'adult1Rate', rp.adult_1_rate,
    'adult2Rate', rp.adult_2_rate,
    'teenRate', rp.teen_rate,
    'childRate', rp.child_rate,
    'infantRate', rp.infant_rate,
    'pms_synced', true
  ) ORDER BY rp.name), '[]'::jsonb)
  INTO _rate_types
  FROM rolos_rate_plans rp
  WHERE rp.property_id = _prop_id AND rp.is_active = true;

  UPDATE properties
  SET amenities = jsonb_set(COALESCE(amenities, '{}'::jsonb), '{pms_rate_types}', _rate_types)
  WHERE id = _prop_id;

  PERFORM set_config('app.syncing_rate_plans', 'false', true);
  RETURN COALESCE(NEW, OLD);
END;
$function$;