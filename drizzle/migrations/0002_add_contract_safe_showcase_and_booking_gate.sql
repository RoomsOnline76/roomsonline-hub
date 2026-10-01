CREATE VIEW public.contract_safe_showcase_properties AS
SELECT
  p.id,
  p.slug,
  p.name,
  p.city,
  p.country,
  p.latitude,
  p.longitude,
  p.price_per_night,
  p.property_type,
  p.images,
  p.description,
  p.editorial_rating,
  p.navigation_tags,
  p.external_system,
  p.external_id,
  p.why_we_chose_this_place,
  p.who_this_suits,
  p.what_its_really_like,
  p.why_this_place_matters,
  p.who_its_not_for
FROM public.properties p
WHERE p.is_active = true
  AND p.show_on_website = true
  AND p.permanently_deleted_at IS NULL
  AND public.property_has_valid_contract(p.id, p.owner_email);

GRANT SELECT ON public.contract_safe_showcase_properties TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_public_booking_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.booking_channel, '') IN ('', 'rol_itinerary')
     AND NOT public.property_has_valid_contract(NEW.property_id, NULL) THEN
    RAISE EXCEPTION 'This property is not currently available for booking.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enforce_public_booking_contract ON public.bookings;
CREATE TRIGGER tr_enforce_public_booking_contract
BEFORE INSERT OR UPDATE OF property_id, booking_channel ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_public_booking_contract();