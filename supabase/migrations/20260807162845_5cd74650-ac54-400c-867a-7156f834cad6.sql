-- ============================================================
-- Rates & Pricing unification: ADDITIVE ONLY
-- No column is dropped, renamed or retyped.
-- ============================================================

-- 1. rolos_rate_plans: additive metadata columns
ALTER TABLE public.rolos_rate_plans
  ADD COLUMN IF NOT EXISTS pricing_model_normalised TEXT,
  ADD COLUMN IF NOT EXISTS min_stay_authority TEXT,
  ADD COLUMN IF NOT EXISTS source_of_truth TEXT;

COMMENT ON COLUMN public.rolos_rate_plans.pricing_model_normalised IS
  'Normalised form of the legacy free-text pricing_model column (per_room | per_person | per_unit). Maintained by trigger. Legacy column remains authoritative for existing readers.';
COMMENT ON COLUMN public.rolos_rate_plans.min_stay_authority IS
  'Which store owns min-stay for this plan: rate_plan | season | unit | amenities_jsonb. Advisory only.';
COMMENT ON COLUMN public.rolos_rate_plans.source_of_truth IS
  'rolos | mirror | external_pms. Advisory only; nothing gates on it yet.';

-- Normalisation trigger (writes only the NEW column, never the legacy one)
CREATE OR REPLACE FUNCTION public.normalise_rate_plan_pricing_model()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v TEXT;
BEGIN
  v := lower(regexp_replace(coalesce(NEW.pricing_model, ''), '[^a-zA-Z]+', '_', 'g'));
  NEW.pricing_model_normalised := CASE
    WHEN v IN ('per_person', 'perperson', 'person', 'pp') THEN 'per_person'
    WHEN v IN ('per_unit', 'perunit', 'unit', 'unitrate', 'unit_rate') THEN 'per_unit'
    WHEN v IN ('per_room', 'perroom', 'room', 'roomrate', 'room_rate') THEN 'per_room'
    WHEN v = '' THEN NULL
    ELSE 'per_room'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalise_rate_plan_pricing_model ON public.rolos_rate_plans;
CREATE TRIGGER trg_normalise_rate_plan_pricing_model
  BEFORE INSERT OR UPDATE OF pricing_model ON public.rolos_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.normalise_rate_plan_pricing_model();

-- Backfill the new column only (no legacy value is touched)
UPDATE public.rolos_rate_plans SET pricing_model = pricing_model WHERE pricing_model IS NOT NULL;

-- 2. rolos_rate_plan_room_types: how the link was established
ALTER TABLE public.rolos_rate_plan_room_types
  ADD COLUMN IF NOT EXISTS link_source TEXT;

COMMENT ON COLUMN public.rolos_rate_plan_room_types.link_source IS
  'explicit | name_match | amenity_id | linked_rolos_id. Records how the unit-type link was derived.';

-- 3. properties: per-property kill switch
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS rate_resolution_mode TEXT NOT NULL DEFAULT 'legacy';

COMMENT ON COLUMN public.properties.rate_resolution_mode IS
  'legacy (default, today''s behaviour) | unified (shared resolver). Per-property kill switch for rate unification.';

-- 4. Parity audit table
CREATE TABLE IF NOT EXISTS public.rolos_rate_resolution_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL,
  property_id UUID NOT NULL,
  room_type_id UUID,
  rate_plan_id UUID,
  stay_date DATE NOT NULL,
  resolved_rate NUMERIC,
  resolved_tier TEXT,
  legacy_rate NUMERIC,
  legacy_tier TEXT,
  delta NUMERIC,
  currency TEXT,
  resolver_version TEXT NOT NULL DEFAULT 'v1',
  consumer TEXT,
  notes JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rolos_rate_resolution_audit TO authenticated;
GRANT ALL ON public.rolos_rate_resolution_audit TO service_role;
ALTER TABLE public.rolos_rate_resolution_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Property members can view rate audit"
  ON public.rolos_rate_resolution_audit FOR SELECT TO authenticated
  USING (public.can_access_property(property_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_rate_audit_property_date
  ON public.rolos_rate_resolution_audit (property_id, stay_date);
CREATE INDEX IF NOT EXISTS idx_rate_audit_run
  ON public.rolos_rate_resolution_audit (run_id);
CREATE INDEX IF NOT EXISTS idx_rate_audit_delta
  ON public.rolos_rate_resolution_audit (property_id) WHERE delta IS DISTINCT FROM 0;

-- 5. Canonical stay restrictions (write-only for now)
CREATE TABLE IF NOT EXISTS public.rolos_stay_restrictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL,
  rate_plan_id UUID,
  room_type_id UUID,
  start_date DATE,
  end_date DATE,
  min_stay INTEGER,
  max_stay INTEGER,
  closed_to_arrival BOOLEAN NOT NULL DEFAULT false,
  closed_to_departure BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL,
  source_ref TEXT,
  has_conflict BOOLEAN NOT NULL DEFAULT false,
  conflict_notes JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rolos_stay_restrictions IS
  'Canonical min/max-stay + CTA/CTD store, populated FROM the five legacy stores. Advisory until a consumer opts in per property.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_stay_restrictions TO authenticated;
GRANT ALL ON public.rolos_stay_restrictions TO service_role;
ALTER TABLE public.rolos_stay_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Property members can view stay restrictions"
  ON public.rolos_stay_restrictions FOR SELECT TO authenticated
  USING (public.can_access_property(property_id, auth.uid()));

CREATE POLICY "Property members can manage stay restrictions"
  ON public.rolos_stay_restrictions FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_stay_restrictions_property
  ON public.rolos_stay_restrictions (property_id, start_date, end_date);

-- Validation via trigger (not CHECK) so date logic stays mutable-safe
CREATE OR REPLACE FUNCTION public.validate_stay_restriction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL AND NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'end_date must be on or after start_date';
  END IF;
  IF NEW.min_stay IS NOT NULL AND NEW.max_stay IS NOT NULL AND NEW.max_stay < NEW.min_stay THEN
    RAISE EXCEPTION 'max_stay must be greater than or equal to min_stay';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_stay_restriction ON public.rolos_stay_restrictions;
CREATE TRIGGER trg_validate_stay_restriction
  BEFORE INSERT OR UPDATE ON public.rolos_stay_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.validate_stay_restriction();

-- updated_at maintenance for the audit table
DROP TRIGGER IF EXISTS trg_rate_audit_updated_at ON public.rolos_rate_resolution_audit;
CREATE TRIGGER trg_rate_audit_updated_at
  BEFORE UPDATE ON public.rolos_rate_resolution_audit
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. One read shape for effective rates (latest audit run per property/unit/date)
CREATE OR REPLACE VIEW public.rolos_v_effective_rates
WITH (security_invoker = on) AS
SELECT DISTINCT ON (a.property_id, a.room_type_id, a.stay_date)
  a.property_id,
  a.room_type_id,
  a.rate_plan_id,
  a.stay_date,
  a.resolved_rate AS rate,
  a.resolved_tier AS tier,
  a.currency,
  a.resolver_version,
  a.created_at AS resolved_at
FROM public.rolos_rate_resolution_audit a
ORDER BY a.property_id, a.room_type_id, a.stay_date, a.created_at DESC;

GRANT SELECT ON public.rolos_v_effective_rates TO authenticated;
GRANT SELECT ON public.rolos_v_effective_rates TO service_role;