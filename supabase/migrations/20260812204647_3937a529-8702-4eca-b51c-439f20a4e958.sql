CREATE UNIQUE INDEX IF NOT EXISTS bookings_nb_external_uidx
  ON public.bookings (property_id, external_reservation_id)
  WHERE integration_type = 'nightsbridge' AND external_reservation_id IS NOT NULL;