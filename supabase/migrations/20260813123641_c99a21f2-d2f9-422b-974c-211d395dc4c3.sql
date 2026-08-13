DO $$
DECLARE
  ids uuid[] := ARRAY[
    '828f362b-6de8-4c32-9a4d-e515dbf810e9',
    '2770dc6e-d7cd-4324-8043-1bf14c7c5b58',
    'ff2ba23c-7e6a-41d5-abc6-d42147237abd',
    '81ebe020-c094-4670-9f47-dfd356f76399'
  ]::uuid[];
  t text;
BEGIN
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