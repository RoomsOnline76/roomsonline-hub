-- Add system_overview section for auto-synced supporting systems documentation
-- Create function to auto-sync supporting systems to help articles

CREATE OR REPLACE FUNCTION public.sync_supporting_system_to_help()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  article_slug text;
  article_title text;
  article_content text;
BEGIN
  -- Generate slug from system name
  article_slug := 'system-' || lower(regexp_replace(NEW.system_name, '[^a-zA-Z0-9]', '-', 'g'));
  article_slug := regexp_replace(article_slug, '-+', '-', 'g');
  article_slug := trim(both '-' from article_slug);
  
  -- Generate title
  article_title := NEW.system_name || ' - System Overview';
  
  -- Generate markdown content
  article_content := '## ' || NEW.system_name || E'\n\n';
  
  IF NEW.system_url IS NOT NULL AND NEW.system_url != '' THEN
    article_content := article_content || '**URL:** [' || NEW.system_url || '](' || NEW.system_url || E')\n\n';
  END IF;
  
  IF NEW.system_function IS NOT NULL AND NEW.system_function != '' THEN
    article_content := article_content || '**Function:** ' || NEW.system_function || E'\n\n';
  END IF;
  
  IF NEW.category IS NOT NULL AND NEW.category != '' THEN
    article_content := article_content || '**Category:** ' || NEW.category || E'\n\n';
  END IF;
  
  IF NEW.login_username IS NOT NULL AND NEW.login_username != '' THEN
    article_content := article_content || '**Login Username:** `' || NEW.login_username || E'`\n\n';
  END IF;
  
  article_content := article_content || E'---\n\n*This article is auto-generated from Supporting Systems.*';
  
  -- Upsert help article
  INSERT INTO public.help_articles (
    slug,
    title,
    section,
    role_target,
    content_markdown,
    is_published,
    related_table
  ) VALUES (
    article_slug,
    article_title,
    'system_overview',
    ARRAY['dev'],
    article_content,
    NEW.is_active,
    'supporting_systems'
  )
  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    content_markdown = EXCLUDED.content_markdown,
    is_published = EXCLUDED.is_published,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- Create trigger for INSERT and UPDATE on supporting_systems
DROP TRIGGER IF EXISTS sync_supporting_system_to_help_trigger ON public.supporting_systems;
CREATE TRIGGER sync_supporting_system_to_help_trigger
  AFTER INSERT OR UPDATE ON public.supporting_systems
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_supporting_system_to_help();

-- Create function to handle deletion
CREATE OR REPLACE FUNCTION public.delete_supporting_system_help_article()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  article_slug text;
BEGIN
  -- Generate the same slug pattern
  article_slug := 'system-' || lower(regexp_replace(OLD.system_name, '[^a-zA-Z0-9]', '-', 'g'));
  article_slug := regexp_replace(article_slug, '-+', '-', 'g');
  article_slug := trim(both '-' from article_slug);
  
  -- Delete the corresponding help article
  DELETE FROM public.help_articles WHERE slug = article_slug AND section = 'system_overview';
  
  RETURN OLD;
END;
$$;

-- Create trigger for DELETE on supporting_systems
DROP TRIGGER IF EXISTS delete_supporting_system_help_trigger ON public.supporting_systems;
CREATE TRIGGER delete_supporting_system_help_trigger
  BEFORE DELETE ON public.supporting_systems
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_supporting_system_help_article();