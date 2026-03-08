-- Phase 6: Security Hardening — fix mutable search_path on functions
CREATE OR REPLACE FUNCTION public.update_bank_export_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_batch_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.batch_reference := 'ROL-BATCH-' || to_char(NOW(), 'YYYY') || '-' || LPAD(NEW.batch_sequence::text, 4, '0');
  RETURN NEW;
END;
$function$;