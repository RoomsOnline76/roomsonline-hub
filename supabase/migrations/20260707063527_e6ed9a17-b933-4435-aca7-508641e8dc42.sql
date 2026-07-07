
ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS tier_pricing_json jsonb;

ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS tier_pricing_json jsonb,
  ADD COLUMN IF NOT EXISTS tier_scope text DEFAULT 'portfolio' CHECK (tier_scope IN ('property','portfolio')),
  ADD COLUMN IF NOT EXISTS room_count_override integer;

UPDATE public.billing_global_defaults
SET tier_pricing_json = '[
  {"min_rooms":0,"max_rooms":9,"monthly_fee":350},
  {"min_rooms":10,"max_rooms":19,"monthly_fee":450},
  {"min_rooms":20,"max_rooms":50,"monthly_fee":600},
  {"min_rooms":51,"max_rooms":null,"monthly_fee":750}
]'::jsonb
WHERE strategy IN ('rolos_pms','volume_tiered')
  AND tier_pricing_json IS NULL;
