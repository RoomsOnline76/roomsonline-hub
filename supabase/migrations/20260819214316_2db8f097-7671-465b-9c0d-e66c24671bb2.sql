-- "booking_made_by" records the staff member who captured the booking, so it is
-- not a trade signal. Only an explicit non-guest booker means trade.
CREATE OR REPLACE FUNCTION public.derive_booking_is_trade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_trade := COALESCE(NEW.booker_is_guest, true) = false;
  RETURN NEW;
END;
$$;

UPDATE public.bookings
SET is_trade = (COALESCE(booker_is_guest, true) = false)
WHERE is_trade <> (COALESCE(booker_is_guest, true) = false);

UPDATE public.rolos_guest_profiles g
SET is_trade = EXISTS (
  SELECT 1 FROM public.bookings b
  WHERE b.is_trade = true
    AND g.email IS NOT NULL
    AND lower(b.guest_email) = lower(g.email)
)
WHERE g.is_trade IS DISTINCT FROM EXISTS (
  SELECT 1 FROM public.bookings b
  WHERE b.is_trade = true
    AND g.email IS NOT NULL
    AND lower(b.guest_email) = lower(g.email)
);