CREATE TABLE public.property_review_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  source text NOT NULL,
  source_id text,
  overall_rating numeric(2,1),
  total_reviews integer DEFAULT 0,
  rating_url text,
  reviews jsonb DEFAULT '[]'::jsonb,
  tobi_blurb text,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(property_id, source)
);

ALTER TABLE public.property_review_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON public.property_review_cache FOR SELECT USING (true);

CREATE POLICY "Service role write access" ON public.property_review_cache FOR ALL USING ((select auth.role()) = 'service_role');