UPDATE public.rolos_booking_rooms l
SET room_id = b.rolos_room_ids[1],
    room_type_id = COALESCE(NULLIF(b.room_type_id, '')::uuid, l.room_type_id)
FROM public.bookings b
WHERE b.id = l.booking_id
  AND b.status NOT IN ('cancelled', 'no_show')
  AND array_length(b.rolos_room_ids, 1) = 1
  AND l.room_id IS DISTINCT FROM b.rolos_room_ids[1];