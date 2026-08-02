-- 1. hostfully_room_types: keep public browsing of room info, but hide access-sensitive fields from unauthenticated visitors
REVOKE SELECT ON public.hostfully_room_types FROM anon;
GRANT SELECT (
  id, property_id, hostfully_room_id, name, description, max_guests, bedrooms, bathrooms, beds,
  daily_rate, currency, images, amenities, is_active, created_at, updated_at, room_size,
  room_size_unit, min_guests, min_stay, max_stay, check_in_time, check_out_time, cleaning_fee,
  security_deposit, extra_guest_fee, tax_rate, property_type, cancellation_policy,
  address_city, address_state, address_country, latitude, longitude, thumbnail_url,
  linked_rate_type_ids, extra_person_policy, bed_configuration, facilities_raw, rate_type,
  linked_rolos_id, total_units
) ON public.hostfully_room_types TO anon;

-- 2. pms_tracker_status: keep public capability matrix, hide internal contacts / notes from unauthenticated visitors
REVOKE SELECT ON public.pms_tracker_status FROM anon;
GRANT SELECT (
  id, system_type, status, has_access, has_docs, has_edge, has_get, has_post, is_production,
  updated_at, created_at, has_account, has_health, has_soft_test, integration_status,
  is_certified, active_environment, has_modify, has_cancel
) ON public.pms_tracker_status TO anon;