CREATE TABLE public.channel_price_coverage_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_type_id uuid,
  unit_name text,
  channel text NOT NULL DEFAULT 'rentals_united',
  channel_listing_id text,
  verdict text NOT NULL DEFAULT 'unverified',
  window_from date,
  window_to date,
  expected_days integer,
  channel_priced_days integer,
  channel_seasons integer,
  channel_zero_priced_days integer,
  local_unpriced_days integer,
  first_gap_date date,
  gap_summary text,
  repush_attempts integer NOT NULL DEFAULT 0,
  last_repush_at timestamp with time zone,
  last_audit_at timestamp with time zone NOT NULL DEFAULT now(),
  error_message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT channel_price_coverage_verdict_check CHECK (verdict IN ('verified','channel_short','local_incomplete','unverified')),
  CONSTRAINT channel_price_coverage_unique UNIQUE (property_id, channel, channel_listing_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_price_coverage_status TO authenticated;
GRANT ALL ON public.channel_price_coverage_status TO service_role;

ALTER TABLE public.channel_price_coverage_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage channel price coverage"
ON public.channel_price_coverage_status
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

CREATE POLICY "Property members view channel price coverage"
ON public.channel_price_coverage_status
FOR SELECT
USING (can_access_property(property_id, auth.uid()));

CREATE INDEX idx_channel_price_coverage_property ON public.channel_price_coverage_status(property_id);
CREATE INDEX idx_channel_price_coverage_verdict ON public.channel_price_coverage_status(verdict) WHERE verdict <> 'verified';

CREATE TRIGGER update_channel_price_coverage_updated_at
BEFORE UPDATE ON public.channel_price_coverage_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();