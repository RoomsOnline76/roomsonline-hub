-- Create journals table for editorial content
CREATE TABLE public.journals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT,
  content TEXT,
  excerpt TEXT,
  featured_image_url TEXT,
  header_image_url TEXT,
  meta_title TEXT,
  meta_description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  publish_date TIMESTAMP WITH TIME ZONE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint on slug
CREATE UNIQUE INDEX journals_slug_unique ON public.journals(slug) WHERE slug IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY;

-- Create policies for admin/dev access
CREATE POLICY "Admins and devs can manage journals"
ON public.journals
FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

-- Public can view published journals
CREATE POLICY "Anyone can view published journals"
ON public.journals
FOR SELECT
USING (status = 'published' AND (publish_date IS NULL OR publish_date <= now()));

-- Create function to generate journal slug
CREATE OR REPLACE FUNCTION public.generate_journal_slug(journal_title text, journal_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 1;
BEGIN
  -- Convert title to lowercase, replace spaces with hyphens, remove special chars
  base_slug := lower(regexp_replace(journal_title, '[^a-zA-Z0-9\s-]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  
  -- Try base slug first
  final_slug := base_slug;
  
  -- If slug exists (for different journal), append counter
  WHILE EXISTS (SELECT 1 FROM public.journals WHERE slug = final_slug AND id != journal_id) LOOP
    final_slug := base_slug || '-' || counter;
    counter := counter + 1;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Create trigger to auto-generate slug
CREATE OR REPLACE FUNCTION public.set_journal_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only generate if slug is null or empty
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_journal_slug(NEW.title, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_journal_slug_trigger
BEFORE INSERT OR UPDATE ON public.journals
FOR EACH ROW
EXECUTE FUNCTION public.set_journal_slug();

-- Create trigger for updated_at
CREATE TRIGGER update_journals_updated_at
BEFORE UPDATE ON public.journals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();