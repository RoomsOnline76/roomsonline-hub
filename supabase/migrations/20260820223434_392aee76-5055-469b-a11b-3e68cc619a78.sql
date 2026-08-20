REVOKE EXECUTE ON FUNCTION public.guard_booking_room_line() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_booking_stay_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.booking_status_is_live(text) FROM PUBLIC, anon;