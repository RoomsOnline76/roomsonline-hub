
-- Connect portal inquiry submissions
CREATE TABLE public.connect_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  property_count TEXT,
  current_pms TEXT,
  message TEXT,
  source TEXT DEFAULT 'connect_portal',
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.connect_inquiries ENABLE ROW LEVEL SECURITY;

-- Public insert policy (no auth required for submissions)
CREATE POLICY "Anyone can submit an inquiry"
ON public.connect_inquiries
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only authenticated admins can read inquiries
CREATE POLICY "Admins can read inquiries"
ON public.connect_inquiries
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'dev')
);
