UPDATE public.billing_global_defaults
SET tier_pricing_json = '[
  {"min_rooms":0,"max_rooms":9,"max_properties":null,"monthly_fee":450,"label":"xs"},
  {"min_rooms":10,"max_rooms":19,"max_properties":null,"monthly_fee":600,"label":"s"},
  {"min_rooms":20,"max_rooms":50,"max_properties":null,"monthly_fee":750,"label":"m"},
  {"min_rooms":51,"max_rooms":null,"max_properties":null,"monthly_fee":925,"label":"l"}
]'::jsonb,
    enterprise_custom_fee = NULL,
    updated_at = now()
WHERE strategy IN ('rolos_pms','volume_tiered');