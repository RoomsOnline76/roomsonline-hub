
CREATE TABLE public.rolos_booking_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id),
  charge_id UUID REFERENCES public.property_charges(id),
  folio_transaction_id UUID REFERENCES public.rolos_folio_transactions(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  calculation_method TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  is_refundable BOOLEAN DEFAULT false,
  refund_timing TEXT,
  refund_status TEXT DEFAULT 'pending',
  refund_transaction_id UUID REFERENCES public.rolos_folio_transactions(id),
  breakdown TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rolos_booking_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view booking charges for their properties"
  ON public.rolos_booking_charges FOR SELECT TO authenticated
  USING (public.can_access_channel_property(property_id, auth.uid()));

CREATE POLICY "Staff can insert booking charges for their properties"
  ON public.rolos_booking_charges FOR INSERT TO authenticated
  WITH CHECK (public.can_access_channel_property(property_id, auth.uid()));

CREATE POLICY "Staff can update booking charges for their properties"
  ON public.rolos_booking_charges FOR UPDATE TO authenticated
  USING (public.can_access_channel_property(property_id, auth.uid()));

CREATE INDEX idx_rolos_booking_charges_booking ON public.rolos_booking_charges(booking_id);
CREATE INDEX idx_rolos_booking_charges_property ON public.rolos_booking_charges(property_id);
