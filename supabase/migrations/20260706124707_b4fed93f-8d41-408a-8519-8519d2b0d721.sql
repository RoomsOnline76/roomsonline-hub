CREATE TABLE public.rolos_rate_plan_stop_sell (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  rate_plan_id uuid NOT NULL REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(rate_plan_id, date)
);

CREATE INDEX idx_rate_plan_stop_sell_property_date ON public.rolos_rate_plan_stop_sell(property_id, date);
CREATE INDEX idx_rate_plan_stop_sell_plan_date ON public.rolos_rate_plan_stop_sell(rate_plan_id, date);

GRANT SELECT ON public.rolos_rate_plan_stop_sell TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_rate_plan_stop_sell TO authenticated;
GRANT ALL ON public.rolos_rate_plan_stop_sell TO service_role;

ALTER TABLE public.rolos_rate_plan_stop_sell ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read rate plan stop sell for active properties"
ON public.rolos_rate_plan_stop_sell FOR SELECT
USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.is_active = true));

CREATE POLICY "rate_plan_stop_sell_select"
ON public.rolos_rate_plan_stop_sell FOR SELECT
TO authenticated
USING (
  is_property_owner(property_id, auth.uid())
  OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE POLICY "rate_plan_stop_sell_insert"
ON public.rolos_rate_plan_stop_sell FOR INSERT
TO authenticated
WITH CHECK (
  is_property_owner(property_id, auth.uid())
  OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE POLICY "rate_plan_stop_sell_update"
ON public.rolos_rate_plan_stop_sell FOR UPDATE
TO authenticated
USING (
  is_property_owner(property_id, auth.uid())
  OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE POLICY "rate_plan_stop_sell_delete"
ON public.rolos_rate_plan_stop_sell FOR DELETE
TO authenticated
USING (
  is_property_owner(property_id, auth.uid())
  OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);