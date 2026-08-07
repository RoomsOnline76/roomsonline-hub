-- ============================================================================
-- Unified Rate Plans — Phase 2 data model. 100% ADDITIVE.
-- No existing column is altered, dropped or re-typed. Every new column is
-- nullable or defaulted so current readers see identical results.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Additive columns on existing tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.rolos_rate_plans
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portfolio_id UUID REFERENCES public.property_portfolios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_scope TEXT NOT NULL DEFAULT 'property';

ALTER TABLE public.rolos_rate_plans
  DROP CONSTRAINT IF EXISTS rolos_rate_plans_plan_scope_check;
ALTER TABLE public.rolos_rate_plans
  ADD CONSTRAINT rolos_rate_plans_plan_scope_check
  CHECK (plan_scope IN ('property', 'portfolio'));

ALTER TABLE public.rolos_rate_plan_room_types
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS differential_type TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS differential_value NUMERIC,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

ALTER TABLE public.rolos_rate_plan_room_types
  DROP CONSTRAINT IF EXISTS rolos_rate_plan_room_types_differential_check;
ALTER TABLE public.rolos_rate_plan_room_types
  ADD CONSTRAINT rolos_rate_plan_room_types_differential_check
  CHECK (differential_type IN ('none', 'amount', 'percent'));

ALTER TABLE public.rolos_rate_prices
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. rolos_shared_seasons — portfolio-shareable season catalog.
--    The Calendar remains the ONLY season configurator; rows here mirror it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rolos_shared_seasons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_peak BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'calendar',
  calendar_season_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rolos_shared_seasons_scope_check
    CHECK (portfolio_id IS NOT NULL OR property_id IS NOT NULL),
  CONSTRAINT rolos_shared_seasons_source_check
    CHECK (source IN ('calendar', 'manual')),
  CONSTRAINT rolos_shared_seasons_range_check
    CHECK (end_date >= start_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_shared_seasons TO authenticated;
GRANT ALL ON public.rolos_shared_seasons TO service_role;
ALTER TABLE public.rolos_shared_seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rolos_shared_seasons_select" ON public.rolos_shared_seasons
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
    OR (property_id IS NOT NULL AND (
      is_property_owner(property_id, auth.uid())
      OR is_linked_owner(property_id, auth.uid())
      OR user_can_access_property_via_portfolio(property_id)
    ))
    OR (portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.property_portfolio_members m
      WHERE m.portfolio_id = rolos_shared_seasons.portfolio_id
        AND user_can_access_property_via_portfolio(m.property_id)
    ))
  );

CREATE POLICY "rolos_shared_seasons_insert" ON public.rolos_shared_seasons
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
    OR (property_id IS NOT NULL AND (
      is_property_owner(property_id, auth.uid())
      OR is_linked_owner(property_id, auth.uid())
    ))
    OR (portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.property_portfolio_members m
      WHERE m.portfolio_id = rolos_shared_seasons.portfolio_id
        AND (is_property_owner(m.property_id, auth.uid()) OR is_linked_owner(m.property_id, auth.uid()))
    ))
  );

CREATE POLICY "rolos_shared_seasons_update" ON public.rolos_shared_seasons
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
    OR (property_id IS NOT NULL AND (
      is_property_owner(property_id, auth.uid())
      OR is_linked_owner(property_id, auth.uid())
    ))
    OR (portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.property_portfolio_members m
      WHERE m.portfolio_id = rolos_shared_seasons.portfolio_id
        AND (is_property_owner(m.property_id, auth.uid()) OR is_linked_owner(m.property_id, auth.uid()))
    ))
  );

CREATE POLICY "rolos_shared_seasons_delete" ON public.rolos_shared_seasons
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
    OR (property_id IS NOT NULL AND is_property_owner(property_id, auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_shared_seasons_portfolio_dates
  ON public.rolos_shared_seasons (portfolio_id, start_date, end_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shared_seasons_property_dates
  ON public.rolos_shared_seasons (property_id, start_date, end_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shared_seasons_calendar_ref
  ON public.rolos_shared_seasons (calendar_season_id)
  WHERE calendar_season_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. rolos_rate_plan_season_rates — seasonal pricing owned by the rate plan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rolos_rate_plan_season_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_plan_id UUID NOT NULL REFERENCES public.rolos_rate_plans(id) ON DELETE CASCADE,
  shared_season_id UUID REFERENCES public.rolos_shared_seasons(id) ON DELETE CASCADE,
  legacy_season_id UUID REFERENCES public.rolos_rate_seasons(id) ON DELETE CASCADE,
  room_type_id UUID REFERENCES public.rolos_room_types(id) ON DELETE CASCADE,
  base_rate NUMERIC,
  extra_adult_rate NUMERIC,
  extra_child_rate NUMERIC,
  differential_type TEXT NOT NULL DEFAULT 'none',
  differential_value NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rate_plan_season_rates_season_check
    CHECK (shared_season_id IS NOT NULL OR legacy_season_id IS NOT NULL),
  CONSTRAINT rate_plan_season_rates_differential_check
    CHECK (differential_type IN ('none', 'amount', 'percent')),
  CONSTRAINT rate_plan_season_rates_value_check
    CHECK (
      (differential_type = 'none' AND base_rate IS NOT NULL)
      OR (differential_type <> 'none' AND differential_value IS NOT NULL)
    )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_rate_plan_season_rates TO authenticated;
GRANT ALL ON public.rolos_rate_plan_season_rates TO service_role;
ALTER TABLE public.rolos_rate_plan_season_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_plan_season_rates_select" ON public.rolos_rate_plan_season_rates
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rolos_rate_plans rp
    WHERE rp.id = rolos_rate_plan_season_rates.rate_plan_id
      AND (
        is_property_owner(rp.property_id, auth.uid())
        OR is_linked_owner(rp.property_id, auth.uid())
        OR user_can_access_property_via_portfolio(rp.property_id)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'dev'::app_role)
        OR has_role(auth.uid(), 'fearless_leader'::app_role)
      )
  ));

CREATE POLICY "rate_plan_season_rates_insert" ON public.rolos_rate_plan_season_rates
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rolos_rate_plans rp
    WHERE rp.id = rolos_rate_plan_season_rates.rate_plan_id
      AND (
        is_property_owner(rp.property_id, auth.uid())
        OR is_linked_owner(rp.property_id, auth.uid())
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'dev'::app_role)
        OR has_role(auth.uid(), 'fearless_leader'::app_role)
      )
  ));

CREATE POLICY "rate_plan_season_rates_update" ON public.rolos_rate_plan_season_rates
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rolos_rate_plans rp
    WHERE rp.id = rolos_rate_plan_season_rates.rate_plan_id
      AND (
        is_property_owner(rp.property_id, auth.uid())
        OR is_linked_owner(rp.property_id, auth.uid())
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'dev'::app_role)
        OR has_role(auth.uid(), 'fearless_leader'::app_role)
      )
  ));

CREATE POLICY "rate_plan_season_rates_delete" ON public.rolos_rate_plan_season_rates
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rolos_rate_plans rp
    WHERE rp.id = rolos_rate_plan_season_rates.rate_plan_id
      AND (
        is_property_owner(rp.property_id, auth.uid())
        OR is_linked_owner(rp.property_id, auth.uid())
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'dev'::app_role)
        OR has_role(auth.uid(), 'fearless_leader'::app_role)
      )
  ));

-- ---------------------------------------------------------------------------
-- 4. Indexes for the lookups booking / ARI already perform
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_rate_plan_season_rates_key
  ON public.rolos_rate_plan_season_rates (
    rate_plan_id,
    COALESCE(shared_season_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(legacy_season_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(room_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rate_plan_season_rates_plan_shared
  ON public.rolos_rate_plan_season_rates (rate_plan_id, shared_season_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rate_plan_season_rates_plan_legacy
  ON public.rolos_rate_plan_season_rates (rate_plan_id, legacy_season_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rate_plan_season_rates_room_type
  ON public.rolos_rate_plan_season_rates (room_type_id)
  WHERE deleted_at IS NULL;

-- Supports the shared resolver's .in("room_type_id", ...) link lookup
CREATE INDEX IF NOT EXISTS idx_rate_plan_room_types_room_type
  ON public.rolos_rate_plan_room_types (room_type_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rolos_rate_plans_property_active
  ON public.rolos_rate_plans (property_id, is_active)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rolos_rate_plans_portfolio
  ON public.rolos_rate_plans (portfolio_id)
  WHERE portfolio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rolos_rate_prices_room_type
  ON public.rolos_rate_prices (room_type_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_shared_seasons_updated_at ON public.rolos_shared_seasons;
CREATE TRIGGER trg_shared_seasons_updated_at
  BEFORE UPDATE ON public.rolos_shared_seasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_rate_plan_season_rates_updated_at ON public.rolos_rate_plan_season_rates;
CREATE TRIGGER trg_rate_plan_season_rates_updated_at
  BEFORE UPDATE ON public.rolos_rate_plan_season_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. Backward-compatibility layer
-- ---------------------------------------------------------------------------
-- 6a. Dual-write: mirror new seasonal prices into the legacy price table
--     whenever they resolve to an existing rolos_rate_seasons row, so every
--     current reader of rolos_rate_prices keeps seeing the same values.
CREATE OR REPLACE FUNCTION public.mirror_rate_plan_season_rate_to_legacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.legacy_season_id IS NOT NULL AND OLD.room_type_id IS NOT NULL THEN
      UPDATE public.rolos_rate_prices
         SET is_active = false, deleted_at = now(), updated_at = now()
       WHERE season_id = OLD.legacy_season_id
         AND room_type_id = OLD.room_type_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.legacy_season_id IS NULL OR NEW.room_type_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Soft-deleted or deactivated rows deactivate the legacy mirror.
  IF NEW.deleted_at IS NOT NULL OR NEW.is_active = false THEN
    UPDATE public.rolos_rate_prices
       SET is_active = false, deleted_at = COALESCE(NEW.deleted_at, now()), updated_at = now()
     WHERE season_id = NEW.legacy_season_id
       AND room_type_id = NEW.room_type_id;
    RETURN NEW;
  END IF;

  -- Only absolute rates can be mirrored into the legacy shape.
  v_rate := NEW.base_rate;
  IF v_rate IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.rolos_rate_prices AS rp (
    season_id, room_type_id, base_rate, extra_adult_rate, extra_child_rate,
    is_active, deleted_at, created_at, updated_at
  ) VALUES (
    NEW.legacy_season_id, NEW.room_type_id, v_rate, NEW.extra_adult_rate, NEW.extra_child_rate,
    true, NULL, now(), now()
  )
  ON CONFLICT (season_id, room_type_id) DO UPDATE
    SET base_rate = EXCLUDED.base_rate,
        extra_adult_rate = EXCLUDED.extra_adult_rate,
        extra_child_rate = EXCLUDED.extra_child_rate,
        is_active = true,
        deleted_at = NULL,
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mirror_rate_plan_season_rate ON public.rolos_rate_plan_season_rates;
CREATE TRIGGER trg_mirror_rate_plan_season_rate
  AFTER INSERT OR UPDATE OR DELETE ON public.rolos_rate_plan_season_rates
  FOR EACH ROW EXECUTE FUNCTION public.mirror_rate_plan_season_rate_to_legacy();

-- 6b. Legacy-shaped read view. Nothing is repointed to it in this phase.
CREATE OR REPLACE VIEW public.rolos_v_rate_plan_season_prices
WITH (security_invoker = true) AS
SELECT
  rp.season_id,
  rp.room_type_id,
  rp.base_rate,
  rp.extra_adult_rate,
  rp.extra_child_rate,
  'rolos_rate_prices'::text AS origin
FROM public.rolos_rate_prices rp
WHERE rp.deleted_at IS NULL AND rp.is_active = true
UNION ALL
SELECT
  sr.legacy_season_id AS season_id,
  sr.room_type_id,
  sr.base_rate,
  sr.extra_adult_rate,
  sr.extra_child_rate,
  'rolos_rate_plan_season_rates'::text AS origin
FROM public.rolos_rate_plan_season_rates sr
WHERE sr.deleted_at IS NULL
  AND sr.is_active = true
  AND sr.legacy_season_id IS NOT NULL
  AND sr.room_type_id IS NOT NULL
  AND sr.base_rate IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.rolos_rate_prices rp2
    WHERE rp2.season_id = sr.legacy_season_id
      AND rp2.room_type_id = sr.room_type_id
      AND rp2.deleted_at IS NULL
      AND rp2.is_active = true
  );

GRANT SELECT ON public.rolos_v_rate_plan_season_prices TO authenticated;
GRANT SELECT ON public.rolos_v_rate_plan_season_prices TO service_role;

COMMENT ON TABLE public.rolos_shared_seasons IS
  'Portfolio-shareable season catalog. Mirror of the Calendar; the Calendar remains the only season configurator.';
COMMENT ON TABLE public.rolos_rate_plan_season_rates IS
  'Seasonal pricing owned by a rate plan. room_type_id NULL = applies to all linked units. Mirrored into rolos_rate_prices for backward compatibility.';