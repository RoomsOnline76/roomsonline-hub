-- Fix search_path for functions
ALTER FUNCTION public.generate_property_slug(text, uuid) SET search_path = public;
ALTER FUNCTION public.set_property_slug() SET search_path = public;