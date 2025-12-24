-- Create table to categorize navigation tags
CREATE TABLE public.navigation_tag_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tag_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('destination', 'type')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.navigation_tag_categories ENABLE ROW LEVEL SECURITY;

-- Anyone can view tag categories
CREATE POLICY "Anyone can view tag categories"
ON public.navigation_tag_categories
FOR SELECT
USING (true);

-- Admins and devs can manage tag categories
CREATE POLICY "Admins and devs can manage tag categories"
ON public.navigation_tag_categories
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- Insert destination tags
INSERT INTO public.navigation_tag_categories (tag_name, category) VALUES
  ('City', 'destination'),
  ('Beach', 'destination'),
  ('Mountain', 'destination'),
  ('Countryside', 'destination');

-- Insert type tags (common property type tags)
INSERT INTO public.navigation_tag_categories (tag_name, category) VALUES
  ('Boutique', 'type'),
  ('Luxury', 'type'),
  ('Budget', 'type'),
  ('Family', 'type'),
  ('Romantic', 'type'),
  ('Pet Friendly', 'type'),
  ('Eco', 'type'),
  ('Historic', 'type'),
  ('Spa', 'type'),
  ('Golf', 'type'),
  ('Safari', 'type'),
  ('Winelands', 'type'),
  ('Self Catering', 'type'),
  ('B&B', 'type'),
  ('Guest House', 'type'),
  ('Hotel', 'type'),
  ('Lodge', 'type'),
  ('Villa', 'type');