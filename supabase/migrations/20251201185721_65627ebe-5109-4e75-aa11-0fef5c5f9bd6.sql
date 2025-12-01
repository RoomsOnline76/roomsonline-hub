-- Create table for storing global meal type suggestions
CREATE TABLE public.meal_type_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meal_type_suggestions ENABLE ROW LEVEL SECURITY;

-- Everyone can view meal type suggestions
CREATE POLICY "Anyone can view meal type suggestions"
ON public.meal_type_suggestions
FOR SELECT
USING (true);

-- Authenticated users can insert new meal type suggestions
CREATE POLICY "Authenticated users can insert meal type suggestions"
ON public.meal_type_suggestions
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Insert default meal types
INSERT INTO public.meal_type_suggestions (name) VALUES 
  ('Self Catering'),
  ('Breakfast'),
  ('Full Board'),
  ('Half Board'),
  ('Room Only'),
  ('Bed & Breakfast'),
  ('All Inclusive')
ON CONFLICT (name) DO NOTHING;