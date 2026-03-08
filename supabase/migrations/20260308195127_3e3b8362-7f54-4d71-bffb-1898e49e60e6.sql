
-- ============================================================================
-- BIDIRECTIONAL SYNC: rolos_rate_plans ↔ amenities.pms_rate_types
-- ============================================================================

-- 1) When rolos_rate_plans changes → update amenities.pms_rate_types JSONB
CREATE OR REPLACE FUNCTION public.sync_rolos_rates_to_overview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_rol boolean;
  _rate_types jsonb;
BEGIN
  -- Guard recursion
  IF current_setting('app.syncing_rate_plans', true) = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT is_rol_property INTO _is_rol FROM properties WHERE id = NEW.property_id;
  IF NOT COALESCE(_is_rol, false) THEN RETURN NEW; END IF;

  PERFORM set_config('app.syncing_rate_plans', 'true', true);

  -- Build JSONB array from all rate plans for this property
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', rp.id,
    'name', rp.name,
    'description', rp.description,
    'baseRate', rp.base_rate,
    'priceType', CASE WHEN rp.pricing_model = 'per_person' THEN 'UnitRate' ELSE 'UnitRate' END,
    'pricingModel', rp.pricing_model,
    'minStayDays', COALESCE(rp.min_stay, 1),
    'maxStayDays', COALESCE(rp.max_stay, 0),
    'minAdvanceDays', 0,
    'maxAdvanceDays', 0,
    'pms_synced', true
  ) ORDER BY rp.name), '[]'::jsonb)
  INTO _rate_types
  FROM rolos_rate_plans rp
  WHERE rp.property_id = NEW.property_id AND rp.is_active = true;

  UPDATE properties
  SET amenities = jsonb_set(COALESCE(amenities, '{}'::jsonb), '{pms_rate_types}', _rate_types)
  WHERE id = NEW.property_id;

  PERFORM set_config('app.syncing_rate_plans', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rolos_rates_to_overview ON rolos_rate_plans;
CREATE TRIGGER trg_sync_rolos_rates_to_overview
  AFTER INSERT OR UPDATE OR DELETE ON rolos_rate_plans
  FOR EACH ROW
  EXECUTE FUNCTION sync_rolos_rates_to_overview();

-- 2) When amenities.pms_rate_types changes in properties → sync to rolos_rate_plans
CREATE OR REPLACE FUNCTION public.sync_overview_rates_to_rolos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_rol boolean;
  _rate jsonb;
  _rate_id text;
  _existing_id uuid;
BEGIN
  -- Guard recursion
  IF current_setting('app.syncing_rate_plans', true) = 'true' THEN
    RETURN NEW;
  END IF;

  _is_rol := COALESCE(NEW.is_rol_property, false);
  IF NOT _is_rol THEN RETURN NEW; END IF;

  -- Only fire if pms_rate_types actually changed
  IF OLD.amenities IS NOT DISTINCT FROM NEW.amenities THEN RETURN NEW; END IF;
  IF (OLD.amenities->>'pms_rate_types') IS NOT DISTINCT FROM (NEW.amenities->>'pms_rate_types') THEN RETURN NEW; END IF;

  PERFORM set_config('app.syncing_rate_plans', 'true', true);

  -- Iterate over each rate type in the JSONB array
  FOR _rate IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.amenities->'pms_rate_types', '[]'::jsonb))
  LOOP
    _rate_id := _rate->>'id';
    
    -- Try to find existing plan by ID (UUID) or by name
    SELECT id INTO _existing_id FROM rolos_rate_plans
    WHERE property_id = NEW.id AND (
      (id::text = _rate_id) OR
      (name = _rate->>'name' AND _rate_id LIKE 'wizard-%' OR _rate_id LIKE 'manual-%')
    )
    LIMIT 1;

    IF _existing_id IS NOT NULL THEN
      -- Update existing
      UPDATE rolos_rate_plans SET
        name = COALESCE(_rate->>'name', name),
        base_rate = CASE WHEN (_rate->>'baseRate') IS NOT NULL THEN (_rate->>'baseRate')::numeric ELSE base_rate END,
        description = COALESCE(NULLIF(_rate->>'description', ''), description),
        min_stay = CASE WHEN (_rate->>'minStayDays') IS NOT NULL THEN (_rate->>'minStayDays')::int ELSE min_stay END,
        max_stay = CASE WHEN (_rate->>'maxStayDays') IS NOT NULL THEN (_rate->>'maxStayDays')::int ELSE max_stay END,
        pricing_model = COALESCE(NULLIF(_rate->>'pricingModel', ''), pricing_model),
        updated_at = now()
      WHERE id = _existing_id;
    ELSE
      -- Insert new
      INSERT INTO rolos_rate_plans (property_id, name, code, base_rate, description, min_stay, max_stay, pricing_model, is_active)
      VALUES (
        NEW.id,
        COALESCE(_rate->>'name', 'New Rate'),
        lower(regexp_replace(COALESCE(_rate->>'name', 'new-rate'), '[^a-zA-Z0-9]', '-', 'g')),
        CASE WHEN (_rate->>'baseRate') IS NOT NULL THEN (_rate->>'baseRate')::numeric ELSE NULL END,
        _rate->>'description',
        COALESCE((_rate->>'minStayDays')::int, 1),
        COALESCE((_rate->>'maxStayDays')::int, 0),
        _rate->>'pricingModel',
        true
      );
    END IF;
  END LOOP;

  PERFORM set_config('app.syncing_rate_plans', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_overview_rates_to_rolos ON properties;
CREATE TRIGGER trg_sync_overview_rates_to_rolos
  AFTER UPDATE OF amenities ON properties
  FOR EACH ROW
  EXECUTE FUNCTION sync_overview_rates_to_rolos();

-- ============================================================================
-- BIDIRECTIONAL SYNC: rolos_message_templates ↔ amenities.templates
-- ============================================================================

-- 3) When rolos_message_templates change → update amenities.templates JSONB
-- Maps: booking_confirmed→confirmation-mailer, pre_arrival→pre-mailer, check_out→post-mailer
CREATE OR REPLACE FUNCTION public.sync_rolos_templates_to_overview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_rol boolean;
  _prop_id uuid;
  _confirmation_body text;
  _pre_offset int;
  _post_offset int;
BEGIN
  IF current_setting('app.syncing_templates', true) = 'true' THEN
    RETURN NEW;
  END IF;

  _prop_id := COALESCE(NEW.property_id, OLD.property_id);
  SELECT is_rol_property INTO _is_rol FROM properties WHERE id = _prop_id;
  IF NOT COALESCE(_is_rol, false) THEN RETURN COALESCE(NEW, OLD); END IF;

  PERFORM set_config('app.syncing_templates', 'true', true);

  -- Get confirmation template body
  SELECT body INTO _confirmation_body FROM rolos_message_templates
  WHERE property_id = _prop_id AND trigger_event = 'booking_confirmed' AND is_active = true
  LIMIT 1;

  -- Get pre-arrival offset (stored as negative hours)
  SELECT ABS(send_offset_hours) INTO _pre_offset FROM rolos_message_templates
  WHERE property_id = _prop_id AND trigger_event = 'pre_arrival' AND is_active = true
  LIMIT 1;

  -- Get post-checkout offset
  SELECT send_offset_hours INTO _post_offset FROM rolos_message_templates
  WHERE property_id = _prop_id AND trigger_event = 'check_out' AND is_active = true
  LIMIT 1;

  UPDATE properties
  SET amenities = jsonb_set(
    COALESCE(amenities, '{}'::jsonb),
    '{templates}',
    jsonb_build_object(
      'selected_template', 'confirmation-mailer',
      'template_content', COALESCE(_confirmation_body, ''),
      'pre_mailer_days', COALESCE(_pre_offset / 24, 0),
      'pre_mailer_hours', COALESCE(_pre_offset % 24, 0),
      'post_mailer_days', COALESCE(_post_offset / 24, 0),
      'post_mailer_hours', COALESCE(_post_offset % 24, 0)
    )
  )
  WHERE id = _prop_id;

  PERFORM set_config('app.syncing_templates', 'false', true);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rolos_templates_to_overview ON rolos_message_templates;
CREATE TRIGGER trg_sync_rolos_templates_to_overview
  AFTER INSERT OR UPDATE OR DELETE ON rolos_message_templates
  FOR EACH ROW
  EXECUTE FUNCTION sync_rolos_templates_to_overview();

-- 4) When amenities.templates changes → sync to rolos_message_templates
CREATE OR REPLACE FUNCTION public.sync_overview_templates_to_rolos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_rol boolean;
  _templates jsonb;
  _old_templates jsonb;
  _content text;
  _pre_hours int;
  _post_hours int;
BEGIN
  IF current_setting('app.syncing_templates', true) = 'true' THEN
    RETURN NEW;
  END IF;

  _is_rol := COALESCE(NEW.is_rol_property, false);
  IF NOT _is_rol THEN RETURN NEW; END IF;

  _templates := NEW.amenities->'templates';
  _old_templates := OLD.amenities->'templates';
  IF _templates IS NOT DISTINCT FROM _old_templates THEN RETURN NEW; END IF;

  PERFORM set_config('app.syncing_templates', 'true', true);

  _content := _templates->>'template_content';
  _pre_hours := COALESCE((_templates->>'pre_mailer_days')::int * 24, 0) + COALESCE((_templates->>'pre_mailer_hours')::int, 0);
  _post_hours := COALESCE((_templates->>'post_mailer_days')::int * 24, 0) + COALESCE((_templates->>'post_mailer_hours')::int, 0);

  -- Sync confirmation template body
  IF _content IS NOT NULL AND _content != '' THEN
    UPDATE rolos_message_templates
    SET body = _content, updated_at = now()
    WHERE property_id = NEW.id AND trigger_event = 'booking_confirmed';
  END IF;

  -- Sync pre-arrival offset (negative = before event)
  IF _pre_hours > 0 THEN
    UPDATE rolos_message_templates
    SET send_offset_hours = -_pre_hours, updated_at = now()
    WHERE property_id = NEW.id AND trigger_event = 'pre_arrival';
  END IF;

  -- Sync post-checkout offset
  UPDATE rolos_message_templates
  SET send_offset_hours = _post_hours, updated_at = now()
  WHERE property_id = NEW.id AND trigger_event = 'check_out';

  PERFORM set_config('app.syncing_templates', 'false', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_overview_templates_to_rolos ON properties;
CREATE TRIGGER trg_sync_overview_templates_to_rolos
  AFTER UPDATE OF amenities ON properties
  FOR EACH ROW
  EXECUTE FUNCTION sync_overview_templates_to_rolos();
