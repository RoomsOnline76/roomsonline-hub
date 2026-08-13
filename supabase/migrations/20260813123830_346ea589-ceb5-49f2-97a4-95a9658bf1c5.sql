DO $$
DECLARE
  ids uuid[];
  t text;
BEGIN
  SELECT array_agg(u.id) INTO ids
  FROM public.bookings u
  WHERE u.rolos_room_ids IS NULL
    AND u.property_id = '76f524f3-8229-4097-b45d-18489f897195'
    AND EXISTS (
      SELECT 1 FROM public.bookings t
      WHERE t.property_id = 'af57b357-9c95-47f5-b7d5-43d3b2f05bb7'
        AND t.external_reservation_id = u.external_reservation_id
    );

  IF ids IS NULL THEN RETURN; END IF;

  FOREACH t IN ARRAY ARRAY[
    'rolos_booking_room_nights','rolos_booking_rooms','rolos_booking_charges',
    'rolos_folio_transactions','rolos_folios','rolos_invoices','rolos_refunds',
    'payment_transactions','rolos_guest_comments','rolos_event_reservations',
    'rolos_reservations','itinerary_bookings','rol_property_invoice_lines',
    'guest_portal_tokens','sync_logs','rolos_channel_reservations',
    'booking_revenue_attributions','booking_sync_status',
    'property_payout_statement_lines','rolos_group_reservations'
  ]
  LOOP
    IF t = 'rolos_folio_transactions' THEN
      EXECUTE 'DELETE FROM public.rolos_folio_transactions WHERE folio_id IN (SELECT id FROM public.rolos_folios WHERE booking_id = ANY($1))' USING ids;
    ELSE
      EXECUTE format('DELETE FROM public.%I WHERE booking_id = ANY($1)', t) USING ids;
    END IF;
  END LOOP;

  DELETE FROM public.bookings WHERE id = ANY(ids);
END $$;