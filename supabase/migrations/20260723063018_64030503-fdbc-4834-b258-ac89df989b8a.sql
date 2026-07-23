
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS pricelabs_config JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.pricelabs_price_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_type_id UUID REFERENCES public.rolos_room_types(id) ON DELETE CASCADE,
  rate_plan_id UUID REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE,
  listing_id TEXT,
  date DATE NOT NULL,
  suggested_price NUMERIC NOT NULL,
  current_price NUMERIC,
  occupancy NUMERIC,
  demand_signal TEXT,
  min_price NUMERIC,
  max_price NUMERIC,
  raw JSONB DEFAULT '{}'::jsonb,
  pulled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, room_type_id, rate_plan_id, date)
);

CREATE INDEX IF NOT EXISTS idx_pricelabs_suggestions_property_date
  ON public.pricelabs_price_suggestions (property_id, date);
CREATE INDEX IF NOT EXISTS idx_pricelabs_suggestions_pulled_at
  ON public.pricelabs_price_suggestions (pulled_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricelabs_price_suggestions TO authenticated;
GRANT ALL ON public.pricelabs_price_suggestions TO service_role;

ALTER TABLE public.pricelabs_price_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricelabs_suggestions_select"
  ON public.pricelabs_price_suggestions FOR SELECT
  USING (
    is_property_owner(property_id, auth.uid())
    OR is_linked_owner(property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  );

CREATE POLICY "pricelabs_suggestions_insert"
  ON public.pricelabs_price_suggestions FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  );

CREATE POLICY "pricelabs_suggestions_update"
  ON public.pricelabs_price_suggestions FOR UPDATE
  USING (
    is_property_owner(property_id, auth.uid())
    OR is_linked_owner(property_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  );

CREATE POLICY "pricelabs_suggestions_delete"
  ON public.pricelabs_price_suggestions FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  );

CREATE OR REPLACE FUNCTION public.pricelabs_suggestions_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricelabs_suggestions_updated ON public.pricelabs_price_suggestions;
CREATE TRIGGER trg_pricelabs_suggestions_updated
  BEFORE UPDATE ON public.pricelabs_price_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.pricelabs_suggestions_touch_updated_at();
