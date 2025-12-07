-- Fix the handle_new_user function to properly check for anonymous users
-- The is_anonymous field is in raw_app_meta_data, not a direct column
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Skip profile creation for anonymous users
  -- Anonymous users have is_anonymous = true in raw_app_meta_data OR have no email
  IF NEW.email IS NOT NULL 
     AND NEW.email != '' 
     AND (NEW.raw_app_meta_data->>'is_anonymous')::boolean IS NOT TRUE THEN
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