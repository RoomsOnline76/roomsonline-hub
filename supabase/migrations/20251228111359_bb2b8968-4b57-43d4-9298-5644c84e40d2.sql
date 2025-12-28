-- Create anonymized AI search logs table
CREATE TABLE public.ai_search_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query TEXT NOT NULL,
  matched_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_search_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (searches are anonymous)
CREATE POLICY "Anyone can log AI searches"
ON public.ai_search_logs
FOR INSERT
WITH CHECK (true);

-- Only admins and devs can view logs
CREATE POLICY "Admins and devs can view AI search logs"
ON public.ai_search_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- Create index for timestamp queries
CREATE INDEX idx_ai_search_logs_created_at ON public.ai_search_logs(created_at DESC);