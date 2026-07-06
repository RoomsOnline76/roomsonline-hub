
CREATE TABLE public.rolos_rate_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  rate_plan_id uuid REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE,
  room_type_id uuid REFERENCES public.rolos_room_types(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.rolos_rate_seasons(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  weekdays int[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  min_occupancy int,
  max_occupancy int,
  adjustment_type text NOT NULL DEFAULT 'percent',
  adjustment_value numeric NOT NULL DEFAULT 0,
  only_on_arrival boolean NOT NULL DEFAULT false,
  booking_window_from date,
  booking_window_to date,
  priority int NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rolos_rate_strategies_date_order CHECK (end_date >= start_date),
  CONSTRAINT rolos_rate_strategies_adjustment_type CHECK (adjustment_type IN ('percent','fixed'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_rate_strategies TO authenticated;
GRANT ALL ON public.rolos_rate_strategies TO service_role;

ALTER TABLE public.rolos_rate_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View rate strategies for accessible properties"
  ON public.rolos_rate_strategies FOR SELECT TO authenticated
  USING (
    is_property_owner(property_id, auth.uid())
    OR is_linked_owner(property_id, auth.uid())
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'dev')
    OR has_role(auth.uid(), 'fearless_leader')
  );

CREATE POLICY "Insert rate strategies for accessible properties"
  ON public.rolos_rate_strategies FOR INSERT TO authenticated
  WITH CHECK (
    is_property_owner(property_id, auth.uid())
    OR is_linked_owner(property_id, auth.uid())
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'dev')
    OR has_role(auth.uid(), 'fearless_leader')
  );

CREATE POLICY "Update rate strategies for accessible properties"
  ON public.rolos_rate_strategies FOR UPDATE TO authenticated
  USING (
    is_property_owner(property_id, auth.uid())
    OR is_linked_owner(property_id, auth.uid())
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'dev')
    OR has_role(auth.uid(), 'fearless_leader')
  );

CREATE POLICY "Delete rate strategies for accessible properties"
  ON public.rolos_rate_strategies FOR DELETE TO authenticated
  USING (
    is_property_owner(property_id, auth.uid())
    OR is_linked_owner(property_id, auth.uid())
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'dev')
    OR has_role(auth.uid(), 'fearless_leader')
  );

CREATE INDEX idx_rate_strategies_property ON public.rolos_rate_strategies(property_id, is_active);
CREATE INDEX idx_rate_strategies_plan ON public.rolos_rate_strategies(rate_plan_id) WHERE rate_plan_id IS NOT NULL;
CREATE INDEX idx_rate_strategies_dates ON public.rolos_rate_strategies(property_id, start_date, end_date);

CREATE TRIGGER trg_rolos_rate_strategies_updated_at
  BEFORE UPDATE ON public.rolos_rate_strategies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.rolos_rate_strategies IS 'Rate strategies: apply rate plans/adjustments to specific weekdays, date ranges, room types, occupancy and booking windows.';
COMMENT ON COLUMN public.rolos_rate_strategies.weekdays IS 'Array of weekday numbers where 0=Sunday and 6=Saturday.';
COMMENT ON COLUMN public.rolos_rate_strategies.adjustment_type IS 'One of: percent, fixed.';
