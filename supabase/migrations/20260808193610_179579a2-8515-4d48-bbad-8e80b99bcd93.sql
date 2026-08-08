-- 1. Generic counter store for ROL document references
CREATE TABLE IF NOT EXISTS public.rol_document_counters (
  scope_key text PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rol_document_counters TO authenticated;
GRANT ALL ON public.rol_document_counters TO service_role;

ALTER TABLE public.rol_document_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Billing admins read document counters" ON public.rol_document_counters;
CREATE POLICY "Billing admins read document counters"
ON public.rol_document_counters FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
);

DROP TRIGGER IF EXISTS update_rol_document_counters_updated_at ON public.rol_document_counters;
CREATE TRIGGER update_rol_document_counters_updated_at
BEFORE UPDATE ON public.rol_document_counters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Resolve a stable 3-letter party code for a property or portfolio
CREATE OR REPLACE FUNCTION public.rol_party_code(_property_id uuid, _portfolio_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  code text;
  src text;
BEGIN
  IF _property_id IS NOT NULL THEN
    SELECT nullif(upper(ref_code), '') INTO code FROM public.properties WHERE id = _property_id;
    IF code IS NOT NULL THEN
      RETURN code;
    END IF;
    SELECT name INTO src FROM public.properties WHERE id = _property_id;
  END IF;

  IF src IS NULL AND _portfolio_id IS NOT NULL THEN
    SELECT coalesce(nullif(slug, ''), name) INTO src FROM public.property_portfolios WHERE id = _portfolio_id;
  END IF;

  IF src IS NOT NULL THEN
    code := upper(substr(regexp_replace(src, '[^A-Za-z0-9]', '', 'g'), 1, 3));
    IF code IS NOT NULL AND length(code) = 3 THEN
      RETURN code;
    END IF;
  END IF;

  RETURN upper(substr(replace(coalesce(_property_id, _portfolio_id, gen_random_uuid())::text, '-', ''), 1, 3));
END;
$$;

-- 3. Mint the next document reference: ROL-<DOC>-<PARTY>-<YYYYMM>-<NNN>
CREATE OR REPLACE FUNCTION public.next_rol_document_reference(_doc text, _party_code text, _period text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doc text;
  v_party text;
  v_period text;
  v_scope text;
  v_next integer;
BEGIN
  v_doc := upper(coalesce(nullif(_doc, ''), 'DOC'));
  v_party := upper(coalesce(nullif(_party_code, ''), 'GEN'));
  v_period := coalesce(nullif(_period, ''), to_char(now(), 'YYYYMM'));
  v_scope := v_doc || ':' || v_party || ':' || v_period;

  INSERT INTO public.rol_document_counters (scope_key, last_value)
  VALUES (v_scope, 1)
  ON CONFLICT (scope_key)
  DO UPDATE SET last_value = public.rol_document_counters.last_value + 1, updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN 'ROL-' || v_doc || '-' || v_party || '-' || v_period || '-' || lpad(v_next::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_rol_document_reference(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rol_party_code(uuid, uuid) TO authenticated, service_role;

-- 4. Auto-assign subscription / setup invoice numbers on insert
CREATE OR REPLACE FUNCTION public.assign_subscription_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doc text;
  v_period text;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;

  v_doc := CASE lower(coalesce(NEW.invoice_kind, 'subscription'))
    WHEN 'once_off' THEN 'SET'
    WHEN 'setup' THEN 'SET'
    WHEN 'adjustment' THEN 'ADJ'
    WHEN 'credit' THEN 'CRD'
    ELSE 'SUB'
  END;

  v_period := to_char(coalesce(NEW.period_start, current_date), 'YYYYMM');

  NEW.invoice_number := public.next_rol_document_reference(
    v_doc,
    public.rol_party_code(NEW.property_id, NEW.portfolio_id),
    v_period
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_invoices_assign_number ON public.subscription_invoices;
CREATE TRIGGER subscription_invoices_assign_number
BEFORE INSERT ON public.subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.assign_subscription_invoice_number();

-- 5. Portfolio booking-share invoices use the same protocol
CREATE OR REPLACE FUNCTION public.assign_portfolio_share_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;
  NEW.invoice_number := public.next_rol_document_reference(
    'SHR',
    public.rol_party_code(NEW.to_property_id, NEW.portfolio_id),
    to_char(coalesce(NEW.period_start, current_date), 'YYYYMM')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portfolio_share_invoices_assign_number ON public.portfolio_share_invoices;
CREATE TRIGGER portfolio_share_invoices_assign_number
BEFORE INSERT ON public.portfolio_share_invoices
FOR EACH ROW EXECUTE FUNCTION public.assign_portfolio_share_invoice_number();

-- 6. Backfill existing documents onto the new protocol (oldest first)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, invoice_kind, property_id, portfolio_id, period_start
    FROM public.subscription_invoices
    ORDER BY created_at
  LOOP
    UPDATE public.subscription_invoices
    SET invoice_number = public.next_rol_document_reference(
      CASE lower(coalesce(r.invoice_kind, 'subscription'))
        WHEN 'once_off' THEN 'SET' WHEN 'setup' THEN 'SET'
        WHEN 'adjustment' THEN 'ADJ' WHEN 'credit' THEN 'CRD' ELSE 'SUB' END,
      public.rol_party_code(r.property_id, r.portfolio_id),
      to_char(coalesce(r.period_start, current_date), 'YYYYMM')
    )
    WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT id, to_property_id, portfolio_id, period_start
    FROM public.portfolio_share_invoices
    ORDER BY created_at
  LOOP
    UPDATE public.portfolio_share_invoices
    SET invoice_number = public.next_rol_document_reference(
      'SHR', public.rol_party_code(r.to_property_id, r.portfolio_id),
      to_char(coalesce(r.period_start, current_date), 'YYYYMM')
    )
    WHERE id = r.id;
  END LOOP;
END $$;