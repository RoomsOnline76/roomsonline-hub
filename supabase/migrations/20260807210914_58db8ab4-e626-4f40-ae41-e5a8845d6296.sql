ALTER TABLE public.rolos_rate_plans
  ADD COLUMN IF NOT EXISTS is_primary_sell boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_to_channels boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sell_priority integer NOT NULL DEFAULT 100;

CREATE UNIQUE INDEX IF NOT EXISTS rolos_rate_plans_one_primary_per_property
  ON public.rolos_rate_plans (property_id)
  WHERE is_primary_sell AND deleted_at IS NULL;

-- Backfill: the single active plan of a property becomes its live/direct plan.
WITH singles AS (
  SELECT property_id, min(id::text)::uuid AS id
  FROM public.rolos_rate_plans
  WHERE deleted_at IS NULL AND coalesce(is_active, true)
  GROUP BY property_id
  HAVING count(*) = 1
)
UPDATE public.rolos_rate_plans p
SET is_primary_sell = true
FROM singles s
WHERE p.id = s.id AND p.is_primary_sell = false;