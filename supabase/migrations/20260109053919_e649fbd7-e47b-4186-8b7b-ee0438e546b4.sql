-- Create survey_responses table for storing project discovery questionnaire submissions
CREATE TABLE public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_email TEXT NOT NULL,
  business_name TEXT NOT NULL,
  contact_details TEXT,
  response_data JSONB NOT NULL,
  report_sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public form - no auth required)
CREATE POLICY "Anyone can submit surveys" 
  ON public.survey_responses 
  FOR INSERT 
  WITH CHECK (true);

-- Only admins can view survey responses
CREATE POLICY "Admins can view survey responses" 
  ON public.survey_responses 
  FOR SELECT 
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Add index for faster lookups
CREATE INDEX idx_survey_responses_submitted_at ON public.survey_responses(submitted_at DESC);
CREATE INDEX idx_survey_responses_client_email ON public.survey_responses(client_email);