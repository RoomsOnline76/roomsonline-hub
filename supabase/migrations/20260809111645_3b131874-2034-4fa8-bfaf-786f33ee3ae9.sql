-- Helper: properties no longer carries an owner_id column; resolve via property_owners.
CREATE OR REPLACE FUNCTION public.resolve_property_owner_uuid(_property_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT po.user_id
  FROM public.property_owners po
  WHERE po.property_id = _property_id AND po.user_id IS NOT NULL
  ORDER BY po.created_at
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.resolve_property_owner_uuid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_property_owner_uuid(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_setup_charges_on_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    owner_uuid := public.resolve_property_owner_uuid(NEW.property_id);
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
$fn$;

CREATE OR REPLACE FUNCTION public.tg_detect_once_off_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
BEGIN
  v_owner := public.resolve_property_owner_uuid(NEW.property_id);

  IF COALESCE(NEW.white_label_allowed,false) = true
     AND COALESCE(NEW.white_label_setup_fee,0) > 0
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.white_label_allowed,false) = false
          OR COALESCE(OLD.white_label_setup_fee,0) = 0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE property_id = NEW.property_id AND kind = 'setup_whitelabel' AND status = 'pending'
     ) THEN
    INSERT INTO public.subscription_charge_items(property_id, owner_id, kind, description, amount)
    VALUES (NEW.property_id, v_owner, 'setup_whitelabel', 'White-label — setup fee', NEW.white_label_setup_fee);
  END IF;

  IF COALESCE(NEW.branding_addon_enabled,false) = true
     AND COALESCE(NEW.branding_addon_setup_fee,0) > 0
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.branding_addon_enabled,false) = false
          OR COALESCE(OLD.branding_addon_setup_fee,0) = 0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE property_id = NEW.property_id AND kind = 'setup_branding' AND status = 'pending'
     ) THEN
    INSERT INTO public.subscription_charge_items(property_id, owner_id, kind, description, amount)
    VALUES (NEW.property_id, v_owner, 'setup_branding', 'Branding add-on — setup fee', NEW.branding_addon_setup_fee);
  END IF;

  IF COALESCE(NEW.pricelabs_allowed,false) = true
     AND COALESCE(NEW.pricelabs_setup_fee,0) > 0
     AND (TG_OP = 'INSERT'
          OR COALESCE(OLD.pricelabs_allowed,false) = false
          OR COALESCE(OLD.pricelabs_setup_fee,0) = 0)
     AND NOT EXISTS (
       SELECT 1 FROM public.subscription_charge_items
       WHERE property_id = NEW.property_id AND kind = 'setup_pricelabs' AND status = 'pending'
     ) THEN
    INSERT INTO public.subscription_charge_items(property_id, owner_id, kind, description, amount)
    VALUES (NEW.property_id, v_owner, 'setup_pricelabs', 'PriceLabs revenue management — setup fee', NEW.pricelabs_setup_fee);
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.raise_setup_invoice_on_contract_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  target_property uuid;
  owner_uuid uuid;
  total numeric := 0;
  lines jsonb := '[]'::jsonb;
  new_invoice_id uuid;
BEGIN
  IF COALESCE(NEW.status, '') NOT IN ('signed', 'active', 'countersigned') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') = COALESCE(NEW.status, '') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'property_contracts' THEN
    target_property := NEW.property_id;
  ELSE
    SELECT id INTO target_property
    FROM public.properties
    WHERE owner_email = NEW.owner_email
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF target_property IS NULL THEN
    RETURN NEW;
  END IF;

  owner_uuid := public.resolve_property_owner_uuid(target_property);

  SELECT COALESCE(SUM(amount), 0),
         COALESCE(jsonb_agg(jsonb_build_object(
           'kind', kind,
           'description', description,
           'amount', amount,
           'charge_item_id', id
         )), '[]'::jsonb)
    INTO total, lines
  FROM public.subscription_charge_items
  WHERE property_id = target_property
    AND invoiced_on_invoice_id IS NULL
    AND COALESCE(amount, 0) > 0;

  IF total <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.subscription_invoices (
    property_id, owner_id, amount, currency,
    subscription_amount, once_off_amount, line_items,
    period_start, period_end, status, invoice_kind, payfast_token
  ) VALUES (
    target_property, owner_uuid, total, 'ZAR',
    0, total, lines,
    CURRENT_DATE, CURRENT_DATE, 'pending', 'setup', gen_random_uuid()::text
  )
  RETURNING id INTO new_invoice_id;

  UPDATE public.subscription_charge_items
     SET invoiced_on_invoice_id = new_invoice_id
   WHERE property_id = target_property
     AND invoiced_on_invoice_id IS NULL
     AND COALESCE(amount, 0) > 0;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.add_subscription_adjustment(_property_id uuid, _portfolio_id uuid, _description text, _amount numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_id uuid; v_owner uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fearless_leader')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _property_id IS NOT NULL THEN
    v_owner := public.resolve_property_owner_uuid(_property_id);
  ELSE
    SELECT owner_id INTO v_owner FROM public.property_portfolios WHERE id = _portfolio_id;
  END IF;
  INSERT INTO public.subscription_charge_items(property_id, portfolio_id, owner_id, kind, description, amount)
  VALUES (_property_id, _portfolio_id, v_owner, 'adjustment', _description, _amount)
  RETURNING id INTO v_id;
  RETURN v_id;
END $fn$;

-- Explicit payment model on billing configs.
ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS payment_model text;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS payment_model text;

UPDATE public.property_billing_configs c
SET payment_model = CASE
  WHEN COALESCE(c.payment_facilitator_enabled, false) THEN 'rol'
  WHEN COALESCE(c.byo_gateway_monthly_fee, 0) > 0 THEN 'byo'
  WHEN p.payment_mode IN ('rol','byo','reservation_only') THEN p.payment_mode
  WHEN COALESCE(p.allow_custom_payment_provider, false) THEN 'byo'
  ELSE 'rol'
END
FROM public.properties p
WHERE p.id = c.property_id AND c.payment_model IS NULL;

UPDATE public.property_billing_configs
SET payment_model = CASE
  WHEN COALESCE(payment_facilitator_enabled, false) THEN 'rol'
  WHEN COALESCE(byo_gateway_monthly_fee, 0) > 0 THEN 'byo'
  ELSE 'reservation_only'
END
WHERE payment_model IS NULL;

UPDATE public.portfolio_billing_configs
SET payment_model = CASE
  WHEN COALESCE(payment_facilitator_enabled, false) THEN 'rol'
  WHEN COALESCE(byo_gateway_monthly_fee, 0) > 0 THEN 'byo'
  ELSE 'reservation_only'
END
WHERE payment_model IS NULL;

ALTER TABLE public.property_billing_configs
  DROP CONSTRAINT IF EXISTS property_billing_configs_payment_model_check;
ALTER TABLE public.property_billing_configs
  ADD CONSTRAINT property_billing_configs_payment_model_check
  CHECK (payment_model IS NULL OR payment_model IN ('rol','byo','reservation_only'));

ALTER TABLE public.portfolio_billing_configs
  DROP CONSTRAINT IF EXISTS portfolio_billing_configs_payment_model_check;
ALTER TABLE public.portfolio_billing_configs
  ADD CONSTRAINT portfolio_billing_configs_payment_model_check
  CHECK (payment_model IS NULL OR payment_model IN ('rol','byo','reservation_only'));