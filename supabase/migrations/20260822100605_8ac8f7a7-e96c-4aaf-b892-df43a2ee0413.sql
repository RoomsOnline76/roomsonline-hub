ALTER TABLE public.rolos_rate_plans
  ADD COLUMN IF NOT EXISTS derived_from_plan_id uuid REFERENCES public.rolos_rate_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS derivation_type text,
  ADD COLUMN IF NOT EXISTS derivation_value numeric,
  ADD COLUMN IF NOT EXISTS derivation_rounding text DEFAULT 'nearest_10';

ALTER TABLE public.rolos_rate_plan_season_rates
  ADD COLUMN IF NOT EXISTS derivation_value numeric,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rolos_rate_plans_derived_from
  ON public.rolos_rate_plans(derived_from_plan_id)
  WHERE derived_from_plan_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_rate_plan_derivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_property uuid;
  parent_derived uuid;
BEGIN
  IF NEW.derived_from_plan_id IS NULL THEN
    NEW.derivation_type := NULL;
    NEW.derivation_value := NULL;
    RETURN NEW;
  END IF;

  IF NEW.derived_from_plan_id = NEW.id THEN
    RAISE EXCEPTION 'A rate plan cannot derive from itself';
  END IF;

  SELECT property_id, derived_from_plan_id
    INTO parent_property, parent_derived
  FROM public.rolos_rate_plans
  WHERE id = NEW.derived_from_plan_id;

  IF parent_property IS NULL THEN
    RAISE EXCEPTION 'Parent rate plan % not found', NEW.derived_from_plan_id;
  END IF;

  IF parent_property IS DISTINCT FROM NEW.property_id THEN
    RAISE EXCEPTION 'A derived rate plan must reference a parent plan on the same property';
  END IF;

  IF parent_derived IS NOT NULL THEN
    RAISE EXCEPTION 'Chained derivation is not allowed: the parent plan is itself derived';
  END IF;

  IF NEW.derivation_type IS NULL OR NEW.derivation_type NOT IN ('percent','amount') THEN
    RAISE EXCEPTION 'derivation_type must be percent or amount for a derived rate plan';
  END IF;

  IF NEW.derivation_value IS NULL THEN
    RAISE EXCEPTION 'derivation_value is required for a derived rate plan';
  END IF;

  IF EXISTS (SELECT 1 FROM public.rolos_rate_plans WHERE derived_from_plan_id = NEW.id) THEN
    RAISE EXCEPTION 'This plan is a parent for other plans and cannot itself be derived';
  END IF;

  IF NEW.derivation_rounding IS NULL THEN
    NEW.derivation_rounding := 'nearest_10';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_rate_plan_derivation ON public.rolos_rate_plans;
CREATE TRIGGER trg_assert_rate_plan_derivation
BEFORE INSERT OR UPDATE OF derived_from_plan_id, derivation_type, derivation_value, derivation_rounding, property_id
ON public.rolos_rate_plans
FOR EACH ROW EXECUTE FUNCTION public.assert_rate_plan_derivation();