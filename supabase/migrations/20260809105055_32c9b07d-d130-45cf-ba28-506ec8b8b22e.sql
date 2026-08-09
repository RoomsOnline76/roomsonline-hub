ALTER TABLE public.property_billing_configs DROP CONSTRAINT IF EXISTS property_billing_configs_subscription_status_check;
ALTER TABLE public.property_billing_configs ADD CONSTRAINT property_billing_configs_subscription_status_check CHECK (subscription_status = ANY (ARRAY['pending'::text,'active'::text,'past_due'::text,'cancelling'::text,'suspended'::text,'cancelled'::text]));

ALTER TABLE public.portfolio_billing_configs DROP CONSTRAINT IF EXISTS portfolio_billing_configs_subscription_status_check;
ALTER TABLE public.portfolio_billing_configs ADD CONSTRAINT portfolio_billing_configs_subscription_status_check CHECK (subscription_status = ANY (ARRAY['pending'::text,'active'::text,'past_due'::text,'cancelling'::text,'suspended'::text,'cancelled'::text]));