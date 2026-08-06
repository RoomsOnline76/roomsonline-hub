ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS guest_first_name text,
  ADD COLUMN IF NOT EXISTS guest_last_name text,
  ADD COLUMN IF NOT EXISTS guest_company text,
  ADD COLUMN IF NOT EXISTS second_guest_name text,
  ADD COLUMN IF NOT EXISTS second_guest_email text,
  ADD COLUMN IF NOT EXISTS second_guest_phone text,
  ADD COLUMN IF NOT EXISTS booking_made_by text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_due_date date;

ALTER TABLE public.rolos_booking_rooms
  ADD COLUMN IF NOT EXISTS rate_plan_id uuid REFERENCES public.rolos_rate_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_type_id uuid REFERENCES public.rolos_room_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infants integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pets integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nightly_rate numeric,
  ADD COLUMN IF NOT EXISTS second_guest_name text;

ALTER TABLE public.rolos_booking_rooms ALTER COLUMN children SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS rolos_booking_rooms_booking_id_idx ON public.rolos_booking_rooms (booking_id);