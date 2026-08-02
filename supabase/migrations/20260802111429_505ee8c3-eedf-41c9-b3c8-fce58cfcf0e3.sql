-- 1) Restrict owner PII columns from anonymous visitors on public property listings
REVOKE SELECT ON public.properties FROM anon;

GRANT SELECT (
  id, name, description, property_type, address, city, country, latitude, longitude,
  price_per_night, max_guests, bedrooms, bathrooms, amenities, images, external_system,
  external_id, is_active, created_at, updated_at, property_url, benson_property_code,
  checkfront_property_code, siteminder_property_code, slug, permanently_deleted_at,
  benson_environment, hero_listing, editorial_rating, why_we_chose_this_place,
  who_this_suits, what_its_really_like, why_this_place_matters, who_its_not_for,
  navigation_tags, hero_video_url, cloudbeds_property_id, littlehotelier_channel_code,
  littlehotelier_region, hotelbeds_hotel_code, external_metadata, pms_managed_fields,
  last_pms_sync_at, pms_sync_status, hostfully_property_uid, owner_pms_credential_id,
  is_rol_property, show_on_website, short_description, ai_confidence_metadata,
  review_sentiment, listing_status, listing_intent, commercial_model, pms_readiness,
  activated_at, activated_by, payment_provider, brand_logo_url, brand_primary_color,
  brand_secondary_color, brand_font_color, brand_override_enabled, brand_accent_color,
  timezone, collections, multi_unit_config, payment_providers, brand_heading_font,
  brand_body_font, is_test_property, brand_heading_text_color, brand_body_text_color,
  brand_muted_text_color, brand_light_bg_color, brand_dark_bg_color,
  rentalsunited_property_id, rentalsunited_building_id, wetu_id, hyperguest_hotel_id,
  hyperguest_environment, hyperguest_enabled, hyperguest_last_static_sync_at,
  hyperguest_last_push_at, hyperguest_last_pull_at, allow_custom_payment_provider,
  pricelabs_config, ru_push_enabled, payment_provider_override, postal_code,
  ru_archived, ru_archived_at
) ON public.properties TO anon;

-- 2) Remove anonymous EXECUTE on internal SECURITY DEFINER functions.
--    Trigger functions and privileged helpers are never meant to be called via the API.
REVOKE EXECUTE ON FUNCTION public.sync_portfolio_payment_config(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_portfolio_payment_config_sync() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_portfolio_member_payment_sync() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_detect_once_off_portfolio() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_detect_once_off_property() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_enable_ru_push() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_setup_charges_on_activation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nextval_subscription_invoice_number() FROM anon, authenticated;

-- Admin-only billing mutations: keep them off the anonymous API surface
REVOKE EXECUTE ON FUNCTION public.waive_subscription_charge(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_subscription_adjustment(uuid, uuid, text, numeric) FROM anon;
