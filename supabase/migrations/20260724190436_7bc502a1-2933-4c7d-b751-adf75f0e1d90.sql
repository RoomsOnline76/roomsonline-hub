
CREATE OR REPLACE FUNCTION public.nextval_subscription_invoice_number()
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT nextval('public.subscription_invoice_number_seq');
$$;
GRANT EXECUTE ON FUNCTION public.nextval_subscription_invoice_number() TO service_role;
