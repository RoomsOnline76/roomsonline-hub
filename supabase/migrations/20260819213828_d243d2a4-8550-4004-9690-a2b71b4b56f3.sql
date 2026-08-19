-- Trade vs Direct segmentation for the HubSpot owner add-on.
-- A reservation is "trade" when the booker is not the guest (agent / company / OTA booker).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_trade boolean NOT NULL DEFAULT false;

ALTER TABLE public.rolos_guest_profiles
  ADD COLUMN IF NOT EXISTS is_trade boolean NOT NULL DEFAULT false;

-- Backfill: an explicit non-guest booker is the strongest trade signal we hold.
UPDATE public.bookings
SET is_trade = true
WHERE is_trade = false
  AND (
    booker_is_guest = false
    OR booking_made_by IS NOT NULL
  );

-- Derive on write so no application code has to remember to set it.
CREATE OR REPLACE FUNCTION public.derive_booking_is_trade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_trade := COALESCE(NEW.booker_is_guest, true) = false
                  OR NEW.booking_made_by IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_derive_is_trade ON public.bookings;
CREATE TRIGGER bookings_derive_is_trade
  BEFORE INSERT OR UPDATE OF booker_is_guest, booking_made_by ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.derive_booking_is_trade();

-- Guest profiles inherit the marker from any trade reservation they hold.
UPDATE public.rolos_guest_profiles g
SET is_trade = true
WHERE g.is_trade = false
  AND g.email IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.is_trade = true
      AND lower(b.guest_email) = lower(g.email)
  );