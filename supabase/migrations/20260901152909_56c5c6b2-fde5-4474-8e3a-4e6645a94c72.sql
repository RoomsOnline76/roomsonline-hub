ALTER TABLE public.rolos_rate_plans
  ADD COLUMN IF NOT EXISTS los_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fsp_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.rolos_rate_plan_los_rungs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_plan_id uuid NOT NULL REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE,
  room_type_id uuid NULL,
  calendar_season_id text NULL,
  start_date date NULL,
  end_date date NULL,
  nights integer NOT NULL CHECK (nights >= 1),
  derivation_type text NOT NULL CHECK (derivation_type IN ('percent','amount')),
  derivation_value numeric NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  pinned_rate numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT los_rung_window_present CHECK (
    calendar_season_id IS NOT NULL OR (start_date IS NOT NULL AND end_date IS NOT NULL)
  ),
  CONSTRAINT los_rung_pin_shape CHECK (
    (is_pinned = false) OR (pinned_rate IS NOT NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_rate_plan_los_rungs TO authenticated;
GRANT ALL ON public.rolos_rate_plan_los_rungs TO service_role;

ALTER TABLE public.rolos_rate_plan_los_rungs ENABLE ROW LEVEL SECURITY;

CREATE POLICY rate_plan_los_rungs_select ON public.rolos_rate_plan_los_rungs
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rolos_rate_plans rp
  WHERE rp.id = rolos_rate_plan_los_rungs.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid())
      OR is_linked_owner(rp.property_id, auth.uid())
      OR user_can_access_property_via_portfolio(rp.property_id)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'fearless_leader'::app_role))
));

CREATE POLICY rate_plan_los_rungs_insert ON public.rolos_rate_plan_los_rungs
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.rolos_rate_plans rp
  WHERE rp.id = rolos_rate_plan_los_rungs.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid())
      OR is_linked_owner(rp.property_id, auth.uid())
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'fearless_leader'::app_role))
));

CREATE POLICY rate_plan_los_rungs_update ON public.rolos_rate_plan_los_rungs
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rolos_rate_plans rp
  WHERE rp.id = rolos_rate_plan_los_rungs.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid())
      OR is_linked_owner(rp.property_id, auth.uid())
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'fearless_leader'::app_role))
));

CREATE POLICY rate_plan_los_rungs_delete ON public.rolos_rate_plan_los_rungs
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rolos_rate_plans rp
  WHERE rp.id = rolos_rate_plan_los_rungs.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid())
      OR is_linked_owner(rp.property_id, auth.uid())
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'fearless_leader'::app_role))
));

CREATE UNIQUE INDEX rate_plan_los_rungs_unique
ON public.rolos_rate_plan_los_rungs (
  rate_plan_id,
  COALESCE(room_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(calendar_season_id, ''),
  COALESCE(start_date, '0001-01-01'::date),
  COALESCE(end_date, '0001-01-01'::date),
  nights
);

CREATE INDEX rate_plan_los_rungs_plan_idx ON public.rolos_rate_plan_los_rungs (rate_plan_id);

CREATE TRIGGER update_rolos_rate_plan_los_rungs_updated_at
BEFORE UPDATE ON public.rolos_rate_plan_los_rungs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.rolos_rate_plan_fsp_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_plan_id uuid NOT NULL REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE,
  room_type_id uuid NULL,
  calendar_season_id text NULL,
  start_date date NULL,
  end_date date NULL,
  nights integer NOT NULL CHECK (nights >= 1),
  nr_of_guests integer NOT NULL CHECK (nr_of_guests >= 1),
  derivation_type text NULL CHECK (derivation_type IN ('percent','amount')),
  derivation_value numeric NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  pinned_total numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fsp_cell_window_present CHECK (
    calendar_season_id IS NOT NULL OR (start_date IS NOT NULL AND end_date IS NOT NULL)
  ),
  CONSTRAINT fsp_cell_pin_shape CHECK (
    (is_pinned = true AND pinned_total IS NOT NULL)
    OR (is_pinned = false AND derivation_type IS NOT NULL AND derivation_value IS NOT NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_rate_plan_fsp_cells TO authenticated;
GRANT ALL ON public.rolos_rate_plan_fsp_cells TO service_role;

ALTER TABLE public.rolos_rate_plan_fsp_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY rate_plan_fsp_cells_select ON public.rolos_rate_plan_fsp_cells
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rolos_rate_plans rp
  WHERE rp.id = rolos_rate_plan_fsp_cells.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid())
      OR is_linked_owner(rp.property_id, auth.uid())
      OR user_can_access_property_via_portfolio(rp.property_id)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'fearless_leader'::app_role))
));

CREATE POLICY rate_plan_fsp_cells_insert ON public.rolos_rate_plan_fsp_cells
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.rolos_rate_plans rp
  WHERE rp.id = rolos_rate_plan_fsp_cells.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid())
      OR is_linked_owner(rp.property_id, auth.uid())
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'fearless_leader'::app_role))
));

CREATE POLICY rate_plan_fsp_cells_update ON public.rolos_rate_plan_fsp_cells
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rolos_rate_plans rp
  WHERE rp.id = rolos_rate_plan_fsp_cells.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid())
      OR is_linked_owner(rp.property_id, auth.uid())
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'fearless_leader'::app_role))
));

CREATE POLICY rate_plan_fsp_cells_delete ON public.rolos_rate_plan_fsp_cells
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rolos_rate_plans rp
  WHERE rp.id = rolos_rate_plan_fsp_cells.rate_plan_id
    AND (is_property_owner(rp.property_id, auth.uid())
      OR is_linked_owner(rp.property_id, auth.uid())
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'dev'::app_role)
      OR has_role(auth.uid(), 'fearless_leader'::app_role))
));

CREATE UNIQUE INDEX rate_plan_fsp_cells_unique
ON public.rolos_rate_plan_fsp_cells (
  rate_plan_id,
  COALESCE(room_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(calendar_season_id, ''),
  COALESCE(start_date, '0001-01-01'::date),
  COALESCE(end_date, '0001-01-01'::date),
  nights,
  nr_of_guests
);

CREATE INDEX rate_plan_fsp_cells_plan_idx ON public.rolos_rate_plan_fsp_cells (rate_plan_id);

CREATE TRIGGER update_rolos_rate_plan_fsp_cells_updated_at
BEFORE UPDATE ON public.rolos_rate_plan_fsp_cells
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();