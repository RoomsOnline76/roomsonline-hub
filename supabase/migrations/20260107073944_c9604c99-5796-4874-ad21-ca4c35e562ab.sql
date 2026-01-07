-- Create PMS tracker status table
CREATE TABLE public.pms_tracker_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_type TEXT NOT NULL UNIQUE,
  status TEXT,
  contact_person TEXT,
  has_access BOOLEAN DEFAULT false,
  has_docs BOOLEAN DEFAULT false,
  has_edge BOOLEAN DEFAULT false,
  has_get BOOLEAN DEFAULT false,
  has_post BOOLEAN DEFAULT false,
  is_production BOOLEAN DEFAULT false,
  notes TEXT,
  additional_info JSONB,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pms_tracker_status ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin access
CREATE POLICY "Admins can view tracker status"
  ON public.pms_tracker_status FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admins can update tracker status"
  ON public.pms_tracker_status FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admins can insert tracker status"
  ON public.pms_tracker_status FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- Trigger for updated_at
CREATE TRIGGER update_pms_tracker_status_updated_at
  BEFORE UPDATE ON public.pms_tracker_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial data from CSV tracker
INSERT INTO public.pms_tracker_status (system_type, status, contact_person, has_access, has_docs, has_edge, has_get, has_post, is_production, additional_info) VALUES
  ('benson', 'COMPLETE', 'Angus', true, true, true, true, true, true, null),
  ('checkfront', 'Wait Debbie Access', 'Debbie', false, true, true, false, false, false, '{"meeting": "12th Jan @ 14:00"}'::jsonb),
  ('cloudbeds', 'Register', null, false, true, true, false, false, false, '{"url": "https://www.cloudbeds.com/partner-with-cloudbeds/"}'::jsonb),
  ('hostfully', 'Wait Debbie Access', 'Debbie', false, true, true, false, false, false, null),
  ('hotelbeds', 'Wait Debbie Access', 'Debbie', true, true, true, true, false, false, null),
  ('littlehotelier', 'Wait Debbie Access', 'Debbie', false, true, true, false, false, false, null),
  ('mews', 'Register', null, false, false, false, false, false, false, '{"url": "https://www.mews.com/en/mews-marketplace"}'::jsonb),
  ('nightsbridge', 'COMPLETE', 'Vusi', true, true, true, true, true, true, null),
  ('roomkey', 'No Action', null, false, false, false, false, false, false, null),
  ('roomracoon', 'Review', null, false, false, false, false, false, false, '{"url": "https://roomraccoon.com/"}'::jsonb),
  ('siteminder', 'Wait Debbie Access', 'Debbie', false, false, false, false, false, false, null),
  ('guestly', 'No Action', null, false, false, false, false, false, false, null),
  ('roomsonline', 'COMPLETE', 'Angus', true, true, true, true, true, true, null);