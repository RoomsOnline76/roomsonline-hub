CREATE TABLE public.ru_api_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id text,
  parent_action text,
  action text NOT NULL,
  endpoint text,
  direction text NOT NULL DEFAULT 'outbound',
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  unit_id uuid,
  ru_property_id text,
  ru_owner_id text,
  ru_user_id text,
  request_xml text,
  response_xml text,
  request_bytes integer,
  response_bytes integer,
  response_id text,
  status_id text,
  status_message text,
  http_status integer,
  success boolean NOT NULL DEFAULT false,
  elapsed_ms integer,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '90 days')
);

COMMENT ON TABLE public.ru_api_log IS 'Durable request/response/ResponseID log for channel manager API exchanges. Retention >= 30 days (default 90) for support cases. Credentials are redacted before storage.';

GRANT SELECT ON public.ru_api_log TO authenticated;
GRANT ALL ON public.ru_api_log TO service_role;

ALTER TABLE public.ru_api_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view channel api log"
ON public.ru_api_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);

CREATE INDEX idx_ru_api_log_created_at ON public.ru_api_log (created_at DESC);
CREATE INDEX idx_ru_api_log_response_id ON public.ru_api_log (response_id) WHERE response_id IS NOT NULL;
CREATE INDEX idx_ru_api_log_property ON public.ru_api_log (property_id, created_at DESC);
CREATE INDEX idx_ru_api_log_action ON public.ru_api_log (action, created_at DESC);
CREATE INDEX idx_ru_api_log_expires_at ON public.ru_api_log (expires_at);
CREATE INDEX idx_ru_api_log_trace ON public.ru_api_log (trace_id) WHERE trace_id IS NOT NULL;