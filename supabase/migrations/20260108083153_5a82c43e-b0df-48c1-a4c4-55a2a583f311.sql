-- Create table to track help search queries
CREATE TABLE public.help_search_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  search_query text NOT NULL,
  results_count integer DEFAULT 0,
  selected_article_id uuid REFERENCES public.help_articles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX idx_help_search_logs_query ON public.help_search_logs(search_query);
CREATE INDEX idx_help_search_logs_created ON public.help_search_logs(created_at);

-- Enable RLS
ALTER TABLE public.help_search_logs ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can log searches
CREATE POLICY "Anyone can log help searches"
  ON public.help_search_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Only admins/devs can view search logs
CREATE POLICY "Admins can view search logs"
  ON public.help_search_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));