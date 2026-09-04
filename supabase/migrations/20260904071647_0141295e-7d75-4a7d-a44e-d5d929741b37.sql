ALTER TABLE public.rolos_stay_restrictions
  ADD COLUMN IF NOT EXISTS days_of_week SMALLINT[] NULL,
  ADD COLUMN IF NOT EXISTS other_days_min_stay INTEGER NULL,
  ADD COLUMN IF NOT EXISTS ignore_within_days INTEGER NULL,
  ADD COLUMN IF NOT EXISTS price_adjust_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS price_adjust_value NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS label TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.rolos_stay_restrictions.days_of_week IS
  'Arrival weekdays the primary minimum applies to (0=Sunday..6=Saturday). NULL/empty = every day.';
COMMENT ON COLUMN public.rolos_stay_restrictions.other_days_min_stay IS
  'Minimum nights that applies on the days NOT listed in days_of_week.';
COMMENT ON COLUMN public.rolos_stay_restrictions.ignore_within_days IS
  'Stop applying this rule when arrival is within this many days (0/NULL = always apply).';
COMMENT ON COLUMN public.rolos_stay_restrictions.price_adjust_type IS
  'Optional uplift for stays caught by this rule: percent | amount | NULL for restriction only.';
COMMENT ON COLUMN public.rolos_stay_restrictions.label IS 'Operator-facing name, e.g. "Easter weekend".';

ALTER TABLE public.rolos_stay_restrictions
  DROP CONSTRAINT IF EXISTS rolos_stay_restrictions_price_adjust_type_check;
ALTER TABLE public.rolos_stay_restrictions
  ADD CONSTRAINT rolos_stay_restrictions_price_adjust_type_check
  CHECK (price_adjust_type IS NULL OR price_adjust_type IN ('percent', 'amount'));