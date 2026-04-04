-- Add age restriction columns to property_specials
ALTER TABLE public.property_specials
  ADD COLUMN IF NOT EXISTS age_restricted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_age integer,
  ADD COLUMN IF NOT EXISTS max_age integer,
  ADD COLUMN IF NOT EXISTS age_label text;

-- Create private storage bucket for ID verification uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('id-verifications', 'id-verifications', false)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload (checkout is unauthenticated)
CREATE POLICY "Anyone can upload ID verifications"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'id-verifications');

-- Only service_role can read (edge function uses service_role)
-- No SELECT policy for anon/authenticated = only service_role can download