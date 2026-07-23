
-- 1. Convert strategy from enum to text so admins can save arbitrary preset slugs.
ALTER TABLE public.billing_global_defaults ALTER COLUMN strategy TYPE text;

-- 2. Add preset metadata columns.
ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS preset_name text,
  ADD COLUMN IF NOT EXISTS preset_description text,
  ADD COLUMN IF NOT EXISTS is_preset boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- 3. Backfill preset_name from existing strategy slug for legacy rows.
UPDATE public.billing_global_defaults
   SET preset_name = COALESCE(
     preset_name,
     CASE strategy
       WHEN 'default' THEN 'Default (Commission)'
       WHEN 'widget' THEN 'Widget — Tiered Commission'
       WHEN 'rolos_pms' THEN 'ROL''OS PMS — Subscription'
       WHEN 'volume_tiered' THEN 'Volume Tiered (Per Unit)'
       WHEN 'payment_facilitator' THEN 'Payment Facilitator Only'
       WHEN 'portfolio_aggregator' THEN 'Portfolio Aggregator (legacy)'
       ELSE INITCAP(REPLACE(strategy, '_', ' '))
     END
   );

-- 4. Retire the enterprise_white_label preset — it is now a white-label add-on layered on any preset.
UPDATE public.property_billing_configs
   SET billing_strategy = 'default'
 WHERE billing_strategy::text = 'enterprise_white_label';
DELETE FROM public.billing_global_defaults WHERE strategy = 'enterprise_white_label';

-- 5. Remove the deprecated legacy facilitator column — no properties depend on it.
ALTER TABLE public.billing_global_defaults DROP COLUMN IF EXISTS payment_facilitator_fee;

-- 6. Ensure unique preset slug going forward.
CREATE UNIQUE INDEX IF NOT EXISTS billing_global_defaults_strategy_key ON public.billing_global_defaults(strategy);
