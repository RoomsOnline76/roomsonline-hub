CREATE OR REPLACE FUNCTION public.enqueue_setup_charges_on_activation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  scope_col text;
  scope_val uuid;
  owner_uuid uuid;
  prev_wl boolean := false;
  prev_brand boolean := false;
  prev_pl boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'property_billing_configs' THEN
    scope_col := 'property_id';
    scope_val := NEW.property_id;
    SELECT owner_id INTO owner_uuid FROM public.properties WHERE id = NEW.property_id;
  ELSIF TG_TABLE_NAME = 'portfolio_billing_configs' THEN
    scope_col := 'portfolio_id';
    scope_val := NEW.portfolio_id;
    SELECT owner_id INTO owner_uuid FROM public.property_portfolios WHERE id = NEW.portfolio_id;
  ELSE
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    prev_wl := COALESCE(OLD.white_label_allowed, false);
    prev_brand := COALESCE(OLD.branding_addon_enabled, false);
    prev_pl := COALESCE(OLD.pricelabs_allowed, false);
  END IF;

  IF NEW.white_label_allowed IS TRUE AND prev_wl IS NOT TRUE
     AND COALESCE(NEW.white_label_setup_fee, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE kind = 'white_label_setup'
         AND ((scope_col = 'property_id' AND property_id = scope_val)
              OR (scope_col = 'portfolio_id' AND portfolio_id = scope_val))
     ) THEN
    INSERT INTO public.subscription_charge_items(property_id, portfolio_id, owner_id, kind, description, amount, currency)
    VALUES (
      CASE WHEN scope_col = 'property_id' THEN scope_val END,
      CASE WHEN scope_col = 'portfolio_id' THEN scope_val END,
      owner_uuid, 'white_label_setup', 'White-label activation (one-off setup)',
      NEW.white_label_setup_fee, 'ZAR'
    );
  END IF;

  IF NEW.branding_addon_enabled IS TRUE AND prev_brand IS NOT TRUE
     AND COALESCE(NEW.branding_addon_setup_fee, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE kind = 'branding_setup'
         AND ((scope_col = 'property_id' AND property_id = scope_val)
              OR (scope_col = 'portfolio_id' AND portfolio_id = scope_val))
     ) THEN
    INSERT INTO public.subscription_charge_items(property_id, portfolio_id, owner_id, kind, description, amount, currency)
    VALUES (
      CASE WHEN scope_col = 'property_id' THEN scope_val END,
      CASE WHEN scope_col = 'portfolio_id' THEN scope_val END,
      owner_uuid, 'branding_setup', 'Branding add-on (one-off setup)',
      NEW.branding_addon_setup_fee, 'ZAR'
    );
  END IF;

  IF NEW.pricelabs_allowed IS TRUE AND prev_pl IS NOT TRUE
     AND COALESCE(NEW.pricelabs_setup_fee, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE kind = 'pricelabs_setup'
         AND ((scope_col = 'property_id' AND property_id = scope_val)
              OR (scope_col = 'portfolio_id' AND portfolio_id = scope_val))
     ) THEN
    INSERT INTO public.subscription_charge_items(property_id, portfolio_id, owner_id, kind, description, amount, currency)
    VALUES (
      CASE WHEN scope_col = 'property_id' THEN scope_val END,
      CASE WHEN scope_col = 'portfolio_id' THEN scope_val END,
      owner_uuid, 'pricelabs_setup', 'PriceLabs revenue management (one-off setup)',
      NEW.pricelabs_setup_fee, 'ZAR'
    );
  END IF;

  RETURN NEW;
END;
$function$;