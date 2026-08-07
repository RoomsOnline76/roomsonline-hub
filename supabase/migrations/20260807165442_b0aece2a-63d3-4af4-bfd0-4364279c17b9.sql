ALTER TABLE public.rolos_rate_plans
  ADD COLUMN IF NOT EXISTS min_advance_days integer,
  ADD COLUMN IF NOT EXISTS max_advance_days integer;

ALTER TABLE public.rolos_rate_plans
  DROP CONSTRAINT IF EXISTS rolos_rate_plans_advance_days_check;

ALTER TABLE public.rolos_rate_plans
  ADD CONSTRAINT rolos_rate_plans_advance_days_check CHECK (
    (min_advance_days IS NULL OR min_advance_days >= 0)
    AND (max_advance_days IS NULL OR max_advance_days >= 0)
    AND (
      min_advance_days IS NULL
      OR max_advance_days IS NULL
      OR max_advance_days >= min_advance_days
    )
  );

COMMENT ON COLUMN public.rolos_rate_plans.min_advance_days IS 'Minimum days before arrival that this rate plan may be booked. NULL = no restriction.';
COMMENT ON COLUMN public.rolos_rate_plans.max_advance_days IS 'Maximum days before arrival that this rate plan may be booked. NULL = no restriction.';