
-- API Rate Limits: per-property configurable quotas
CREATE TABLE public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid UNIQUE REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  requests_per_minute integer NOT NULL DEFAULT 60,
  requests_per_hour integer NOT NULL DEFAULT 1000,
  daily_limit integer NOT NULL DEFAULT 10000,
  burst_limit integer NOT NULL DEFAULT 20,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- API Request Log: audit trail for every API call
CREATE TABLE public.api_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  api_key_id uuid,
  api_version text NOT NULL DEFAULT 'v1',
  action text NOT NULL,
  status_code integer NOT NULL,
  response_time_ms integer,
  ip_address text,
  user_agent text,
  request_body_size integer,
  error_code text,
  endpoint text NOT NULL DEFAULT 'roomsonline-pms-api',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_request_log_property_created ON public.api_request_log (property_id, created_at DESC);
CREATE INDEX idx_api_request_log_created ON public.api_request_log (created_at DESC);
CREATE INDEX idx_api_request_log_action ON public.api_request_log (action, created_at DESC);

ALTER TABLE public.integration_configs ADD COLUMN IF NOT EXISTS api_version text NOT NULL DEFAULT 'v1';

-- RLS
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rate limits" ON public.api_rate_limits
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'fearless_leader')
  );

CREATE POLICY "Owners can view own rate limits" ON public.api_rate_limits
  FOR SELECT TO authenticated
  USING (
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  );

ALTER TABLE public.api_request_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all request logs" ON public.api_request_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.has_role(auth.uid(), 'fearless_leader')
  );

CREATE POLICY "Owners can view own request logs" ON public.api_request_log
  FOR SELECT TO authenticated
  USING (
    property_id IS NOT NULL AND (
      public.is_property_owner(property_id, auth.uid()) OR
      public.is_linked_owner(property_id, auth.uid())
    )
  );

CREATE POLICY "Service can insert request logs" ON public.api_request_log
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE TRIGGER update_api_rate_limits_updated_at
  BEFORE UPDATE ON public.api_rate_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
