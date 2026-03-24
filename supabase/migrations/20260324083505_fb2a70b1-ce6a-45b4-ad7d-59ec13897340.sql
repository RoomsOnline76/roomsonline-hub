CREATE OR REPLACE FUNCTION public.generate_portfolio_slug(portfolio_name text, portfolio_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 1;
BEGIN
  base_slug := lower(regexp_replace(portfolio_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.property_portfolios WHERE slug = final_slug AND id != portfolio_id) LOOP
    final_slug := base_slug || '-' || counter;
    counter := counter + 1;
  END LOOP;
  RETURN final_slug;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_portfolio_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_portfolio_slug(NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_portfolio_slug_trigger ON public.property_portfolios;
CREATE TRIGGER set_portfolio_slug_trigger
  BEFORE INSERT OR UPDATE ON public.property_portfolios
  FOR EACH ROW
  EXECUTE FUNCTION public.set_portfolio_slug();

UPDATE public.property_portfolios
SET slug = public.generate_portfolio_slug(name, id)
WHERE slug IS NULL OR slug = '';