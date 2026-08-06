CREATE TABLE public.rolos_booking_room_nights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  booking_room_id uuid NOT NULL REFERENCES public.rolos_booking_rooms(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  stay_date date NOT NULL,
  rate numeric NOT NULL DEFAULT 0,
  rate_plan_id uuid REFERENCES public.rolos_rate_plans(id) ON DELETE SET NULL,
  is_override boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (booking_room_id, stay_date)
);

CREATE INDEX idx_brn_booking ON public.rolos_booking_room_nights(booking_id);
CREATE INDEX idx_brn_property_date ON public.rolos_booking_room_nights(property_id, stay_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rolos_booking_room_nights TO authenticated;
GRANT ALL ON public.rolos_booking_room_nights TO service_role;

ALTER TABLE public.rolos_booking_room_nights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Property members manage booking room nights"
ON public.rolos_booking_room_nights FOR ALL TO authenticated
USING (public.can_access_property(property_id, auth.uid()))
WITH CHECK (public.can_access_property(property_id, auth.uid()));

CREATE TRIGGER update_rolos_booking_room_nights_updated_at
BEFORE UPDATE ON public.rolos_booking_room_nights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();