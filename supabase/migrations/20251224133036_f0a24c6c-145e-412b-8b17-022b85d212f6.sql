-- Create book_page_images table for 3x3 grid
CREATE TABLE public.book_page_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_type TEXT NOT NULL CHECK (column_type IN ('experience', 'map', 'curated')),
  row_position INTEGER NOT NULL CHECK (row_position BETWEEN 1 AND 3),
  image_url TEXT NOT NULL,
  alt_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(column_type, row_position)
);

-- Enable RLS
ALTER TABLE public.book_page_images ENABLE ROW LEVEL SECURITY;

-- Admins and devs can manage book page images
CREATE POLICY "Admins and devs can manage book page images" 
ON public.book_page_images
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- Public can view book page images
CREATE POLICY "Anyone can view book page images" 
ON public.book_page_images
FOR SELECT
USING (true);