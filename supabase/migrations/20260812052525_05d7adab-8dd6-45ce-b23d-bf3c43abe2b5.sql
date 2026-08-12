UPDATE public.billing_global_defaults
SET preset_name = 'ROL''OS — Free platform, booking fee only',
    preset_description = 'Free for the first 60 days and free to run thereafter. No subscription, no setup fee, no room-count tiers. Revenue is a booking fee on OTA/channel-delivered and widget/embed bookings. All modules (white label, revenue management, PMS, channel integration, API) are included at no charge.',
    default_subscription_fee = NULL,
    tier_pricing_json = NULL,
    branding_addon_monthly_fee = 0,
    branding_addon_setup_fee = 0,
    white_label_monthly_fee = 0,
    white_label_setup_fee = 0,
    pricelabs_monthly_fee = 0,
    pricelabs_setup_fee = 0,
    byo_gateway_monthly_fee = 0,
    updated_at = now()
WHERE strategy = 'rolos_pms';