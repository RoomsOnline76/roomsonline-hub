CREATE OR REPLACE FUNCTION public.validate_rolos_transaction_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.transaction_type NOT IN (
    'charge','payment','refund','adjustment','void',
    'extra','minibar','tax','fee','deposit','surcharge','service_charge'
  ) THEN
    RAISE EXCEPTION 'Invalid transaction type: %', NEW.transaction_type;
  END IF;
  RETURN NEW;
END;
$function$;