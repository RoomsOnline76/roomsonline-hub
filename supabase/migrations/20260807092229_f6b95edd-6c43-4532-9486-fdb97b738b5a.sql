-- The blanket PUBLIC grant on these routines is what made them anon-callable.
REVOKE ALL ON FUNCTION public.rolos_adjust_booked_inventory(uuid, uuid, date, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rolos_apply_block_inventory(uuid, uuid, date, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rolos_convert_block_to_booked(uuid, uuid, date, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rolos_hold_block_inventory(uuid, uuid, date, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rolos_room_type_capacity(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_crm_scope(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_profile_role_self_escalation() FROM PUBLIC;

-- Restore only the access that is actually needed.
GRANT EXECUTE ON FUNCTION public.rolos_adjust_booked_inventory(uuid, uuid, date, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rolos_apply_block_inventory(uuid, uuid, date, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rolos_convert_block_to_booked(uuid, uuid, date, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rolos_hold_block_inventory(uuid, uuid, date, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rolos_room_type_capacity(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_crm_scope(uuid, uuid, uuid) TO authenticated, service_role;