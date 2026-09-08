ALTER TABLE public.rolos_rate_plan_los_rungs
  ADD COLUMN policy_id uuid REFERENCES public.rolos_reservation_policies(id);

ALTER TABLE public.rolos_rate_plan_fsp_cells
  ADD COLUMN policy_id uuid REFERENCES public.rolos_reservation_policies(id);