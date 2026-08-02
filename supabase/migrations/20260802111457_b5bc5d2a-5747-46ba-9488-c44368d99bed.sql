REVOKE EXECUTE ON FUNCTION public.sync_portfolio_payment_config(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_portfolio_payment_config_sync() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_portfolio_member_payment_sync() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_detect_once_off_portfolio() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_detect_once_off_property() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_enable_ru_push() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_setup_charges_on_activation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.nextval_subscription_invoice_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.waive_subscription_charge(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_subscription_adjustment(uuid, uuid, text, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.waive_subscription_charge(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_subscription_adjustment(uuid, uuid, text, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_portfolio_payment_config(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.nextval_subscription_invoice_number() TO service_role;
