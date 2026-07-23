
-- Extend billing_global_defaults
ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS white_label_setup_fee numeric,
  ADD COLUMN IF NOT EXISTS white_label_billing_mode text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS branding_addon_allowed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS branding_addon_monthly_fee numeric,
  ADD COLUMN IF NOT EXISTS branding_addon_setup_fee numeric,
  ADD COLUMN IF NOT EXISTS branding_addon_billing_mode text DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS pricelabs_setup_fee numeric,
  ADD COLUMN IF NOT EXISTS channel_manager_per_unit_fee numeric,
  ADD COLUMN IF NOT EXISTS sales_rep_tier_criteria_json jsonb;

-- Extend property_billing_configs (per-property overrides / toggles)
ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS white_label_setup_fee numeric,
  ADD COLUMN IF NOT EXISTS white_label_billing_mode text,
  ADD COLUMN IF NOT EXISTS branding_addon_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS branding_addon_monthly_fee numeric,
  ADD COLUMN IF NOT EXISTS branding_addon_setup_fee numeric,
  ADD COLUMN IF NOT EXISTS branding_addon_billing_mode text,
  ADD COLUMN IF NOT EXISTS pricelabs_setup_fee numeric,
  ADD COLUMN IF NOT EXISTS channel_manager_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS channel_manager_per_unit_fee numeric;

-- Seed a sensible default for channel manager per unit (R60) on the rolos_pms strategy row if unset
UPDATE public.billing_global_defaults
  SET channel_manager_per_unit_fee = 60
  WHERE strategy = 'rolos_pms' AND channel_manager_per_unit_fee IS NULL;

-- Seed sales rep tier criteria on the 'default' row if empty
UPDATE public.billing_global_defaults
  SET sales_rep_tier_criteria_json = jsonb_build_object(
    'base',        jsonb_build_object('min_props', 0,  'min_mrr', 0,      'first_year_rate', 20, 'residual_rate', 5,   'notes', 'Entry tier'),
    'accelerated', jsonb_build_object('min_props', 10, 'min_mrr', 15000,  'first_year_rate', 25, 'residual_rate', 7.5, 'notes', 'Consistent producer'),
    'elite',       jsonb_build_object('min_props', 25, 'min_mrr', 40000,  'first_year_rate', 30, 'residual_rate', 10,  'notes', 'Top tier / strategic')
  )
  WHERE strategy = 'default' AND sales_rep_tier_criteria_json IS NULL;
