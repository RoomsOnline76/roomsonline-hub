
-- Yield rules table for revenue management engine
CREATE TABLE public.rolos_yield_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type text NOT NULL DEFAULT 'occupancy_threshold',
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  adjustment_percent numeric NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.rolos_yield_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view yield rules for accessible properties"
  ON public.rolos_yield_rules FOR SELECT TO authenticated
  USING (public.can_access_property(property_id, auth.uid()));

CREATE POLICY "Users can manage yield rules for accessible properties"
  ON public.rolos_yield_rules FOR ALL TO authenticated
  USING (public.can_access_property(property_id, auth.uid()))
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

-- Index
CREATE INDEX idx_yield_rules_property ON public.rolos_yield_rules(property_id, is_active);

COMMENT ON TABLE public.rolos_yield_rules IS 'Yield management rules: occupancy thresholds, day-of-week, lead time, season-based rate adjustments';
COMMENT ON COLUMN public.rolos_yield_rules.rule_type IS 'One of: occupancy_threshold, day_of_week, lead_time, season, event';
COMMENT ON COLUMN public.rolos_yield_rules.condition IS 'JSON conditions e.g. {"min_occupancy": 80, "max_occupancy": 100} or {"days": ["friday","saturday"]} or {"min_lead_days": 0, "max_lead_days": 7}';
COMMENT ON COLUMN public.rolos_yield_rules.adjustment_percent IS 'Rate adjustment as percentage, positive=increase, negative=decrease';
