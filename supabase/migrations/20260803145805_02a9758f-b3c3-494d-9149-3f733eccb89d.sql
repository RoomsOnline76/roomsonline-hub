ALTER TABLE public.property_specials
  ADD COLUMN IF NOT EXISTS deal_type TEXT NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS lead_days_min INTEGER,
  ADD COLUMN IF NOT EXISTS lead_days_max INTEGER,
  ADD COLUMN IF NOT EXISTS lead_hours_max INTEGER,
  ADD COLUMN IF NOT EXISTS dow_mask TEXT[],
  ADD COLUMN IF NOT EXISTS stay_date_ranges JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS is_stackable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_mode TEXT,
  ADD COLUMN IF NOT EXISTS price_pointing TEXT,
  ADD COLUMN IF NOT EXISTS applicable_rate_plan_ids UUID[],
  ADD COLUMN IF NOT EXISTS cancellation_policy_id UUID REFERENCES public.rolos_reservation_policies(id) ON DELETE SET NULL;

ALTER TABLE public.rolos_reservation_policies
  ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'property',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS linked_master_id UUID REFERENCES public.rolos_reservation_policies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_property_specials_deal_type ON public.property_specials(property_id, deal_type);
CREATE INDEX IF NOT EXISTS idx_res_policies_linked_master ON public.rolos_reservation_policies(linked_master_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_res_policies_one_master ON public.rolos_reservation_policies(property_id) WHERE is_master;

CREATE OR REPLACE FUNCTION public.enforce_single_master_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_master THEN
    UPDATE public.rolos_reservation_policies
      SET is_master = false
      WHERE property_id = NEW.property_id
        AND id <> NEW.id
        AND is_master;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_master_policy ON public.rolos_reservation_policies;
CREATE TRIGGER trg_single_master_policy
BEFORE INSERT OR UPDATE OF is_master ON public.rolos_reservation_policies
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_master_policy();

UPDATE public.rolos_reservation_policies SET is_master = true
WHERE is_default AND NOT is_master
  AND NOT EXISTS (
    SELECT 1 FROM public.rolos_reservation_policies m
    WHERE m.property_id = rolos_reservation_policies.property_id AND m.is_master
  );