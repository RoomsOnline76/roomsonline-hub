ALTER TABLE public.rolos_group_reservations
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rolos_rooms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rolos_group_reservations_room_id
  ON public.rolos_group_reservations(room_id);