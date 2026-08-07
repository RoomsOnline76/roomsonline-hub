-- An explicit anon grant survived the PUBLIC revoke on these two; remove it.
REVOKE EXECUTE ON FUNCTION public.rolos_room_type_capacity(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_crm_scope(uuid, uuid, uuid) FROM anon;