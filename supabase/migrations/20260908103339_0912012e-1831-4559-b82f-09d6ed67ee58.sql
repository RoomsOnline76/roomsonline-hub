ALTER TABLE public.rolos_booking_charges
  DROP CONSTRAINT rolos_booking_charges_charge_id_fkey;

ALTER TABLE public.rolos_booking_charges
  ADD CONSTRAINT rolos_booking_charges_charge_id_fkey
  FOREIGN KEY (charge_id) REFERENCES public.property_charges(id) ON DELETE SET NULL;