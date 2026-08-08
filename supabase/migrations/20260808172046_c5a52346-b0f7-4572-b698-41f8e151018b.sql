ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS engagement_date date,
  ADD COLUMN IF NOT EXISTS free_period_days integer,
  ADD COLUMN IF NOT EXISTS billing_anchor_day integer;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS engagement_date date,
  ADD COLUMN IF NOT EXISTS free_period_days integer,
  ADD COLUMN IF NOT EXISTS billing_anchor_day integer;

ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS free_period_days_default integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS fee_margin_map_json jsonb NOT NULL DEFAULT '{
    "monthly_subscription": "margin",
    "rolos_per_unit": "margin",
    "white_label_monthly": "margin",
    "branding_monthly": "margin",
    "wbe_flat": "margin",
    "white_label_setup": "margin",
    "branding_setup": "margin",
    "pricelabs_monthly": "passthrough",
    "pricelabs_setup": "passthrough",
    "channel_units": "passthrough",
    "channel_setup": "passthrough",
    "aggregator_setup": "passthrough",
    "gateway_transaction_fee": "passthrough"
  }'::jsonb;

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_status_period
  ON public.subscription_invoices (status, invoice_kind, period_start);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_paid_at
  ON public.subscription_invoices (paid_at);

-- Consolidate outstanding one-off setup charges into a standalone setup invoice
-- as soon as the contract is signed. Monthly billing never carries these.
CREATE OR REPLACE FUNCTION public.raise_setup_invoice_on_contract_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT owner_id INTO owner_uuid FROM public.properties WHERE id = target_property;

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
$$;

DROP TRIGGER IF EXISTS trg_setup_invoice_property_contract ON public.property_contracts;
CREATE TRIGGER trg_setup_invoice_property_contract
AFTER INSERT OR UPDATE OF status ON public.property_contracts
FOR EACH ROW EXECUTE FUNCTION public.raise_setup_invoice_on_contract_signed();

DROP TRIGGER IF EXISTS trg_setup_invoice_owner_contract ON public.owner_contracts;
CREATE TRIGGER trg_setup_invoice_owner_contract
AFTER INSERT OR UPDATE OF status ON public.owner_contracts
FOR EACH ROW EXECUTE FUNCTION public.raise_setup_invoice_on_contract_signed();