-- Update the handle_new_user function to skip anonymous users
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip profile creation for anonymous users (they don't have an email)
  IF NEW.email IS NOT NULL AND NEW.email != '' AND NEW.is_anonymous IS NOT TRUE THEN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
  END IF;
  RETURN NEW;
END;
$function$;