ALTER TABLE public.rolos_rate_plan_los_rungs
  ADD COLUMN IF NOT EXISTS min_stay_nights INTEGER;

ALTER TABLE public.rolos_rate_plan_fsp_cells
  ADD COLUMN IF NOT EXISTS min_stay_nights INTEGER;

COMMENT ON COLUMN public.rolos_rate_plan_los_rungs.min_stay_nights IS
  'Optional minimum nights for a dated window (event weekends). Advisory: mirrored into rolos_stay_restrictions, never blocks direct checkout.';
COMMENT ON COLUMN public.rolos_rate_plan_fsp_cells.min_stay_nights IS
  'Optional minimum nights for a dated window (event weekends). Advisory: mirrored into rolos_stay_restrictions, never blocks direct checkout.';