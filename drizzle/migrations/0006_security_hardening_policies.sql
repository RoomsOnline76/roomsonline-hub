-- Scheduled-job token
CREATE TABLE IF NOT EXISTS public.internal_cron_tokens (
  id integer PRIMARY KEY DEFAULT 1,
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_cron_tokens_single CHECK (id = 1)
);
REVOKE ALL ON public.internal_cron_tokens FROM anon, authenticated;
GRANT ALL ON public.internal_cron_tokens TO service_role;
ALTER TABLE public.internal_cron_tokens ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_cron_tokens (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_cron_token(_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _token IS NOT NULL AND length(_token) > 20 AND EXISTS (SELECT 1 FROM public.internal_cron_tokens WHERE token = _token)
$$;
REVOKE ALL ON FUNCTION public.verify_cron_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.cron_token()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT token FROM public.internal_cron_tokens WHERE id = 1
$$;
REVOKE ALL ON FUNCTION public.cron_token() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_token() TO service_role;

-- Revenue share function: system only
REVOKE EXECUTE ON FUNCTION public.attribute_portfolio_share(uuid) FROM PUBLIC, anon, authenticated;

-- Bookings insert
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
CREATE POLICY "Staff create bookings for managed properties" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_property(property_id, auth.uid()) OR public.has_role(auth.uid(), 'fearless_leader'::app_role));
CREATE POLICY "Guests create pending unpaid bookings" ON public.bookings
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status IN ('pending', 'pending_payment')
    AND coalesce(payment_status, 'pending') IN ('pending', 'unpaid', 'awaiting_eft')
    AND coalesce(amount_paid, 0) = 0
    AND paid_at IS NULL
    AND calculated_commission IS NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Itineraries insert
DROP POLICY IF EXISTS "Users can create itineraries" ON public.itineraries;
CREATE POLICY "Users create own draft itineraries" ON public.itineraries
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'draft'
    AND brochure_pdf_url IS NULL
    AND rol_reference IS NULL
    AND ((auth.uid() IS NOT NULL AND user_id = auth.uid()) OR (user_id IS NULL AND session_id IS NOT NULL AND length(session_id) BETWEEN 8 AND 128))
  );

-- Access requests
DROP POLICY IF EXISTS "Anyone can submit access requests" ON public.access_requests;
CREATE POLICY "Anyone can submit pending access requests" ON public.access_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
    AND length(full_name) BETWEEN 1 AND 200 AND length(email) BETWEEN 3 AND 320
    AND coalesce(length(message), 0) <= 5000);

-- Connect inquiries
DROP POLICY IF EXISTS "Anyone can submit an inquiry" ON public.connect_inquiries;
CREATE POLICY "Anyone can submit a new inquiry" ON public.connect_inquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (coalesce(status, 'new') = 'new'
    AND length(name) BETWEEN 1 AND 200 AND length(email) BETWEEN 3 AND 320
    AND coalesce(length(message), 0) <= 5000 AND coalesce(length(company), 0) <= 300
    AND coalesce(length(property_count), 0) <= 500 AND coalesce(length(current_pms), 0) <= 300);

-- Surveys
DROP POLICY IF EXISTS "Anyone can submit surveys" ON public.survey_responses;
CREATE POLICY "Anyone can submit unsent surveys" ON public.survey_responses
  FOR INSERT TO anon, authenticated
  WITH CHECK (report_sent_at IS NULL AND length(client_email) BETWEEN 3 AND 320
    AND length(business_name) BETWEEN 1 AND 300 AND pg_column_size(response_data) < 200000);

-- Search logs
DROP POLICY IF EXISTS "Anyone can log AI searches" ON public.ai_search_logs;
CREATE POLICY "Anyone can log short AI searches" ON public.ai_search_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (length(query) BETWEEN 1 AND 500 AND coalesce(matched_count, 0) BETWEEN 0 AND 10000);

DROP POLICY IF EXISTS "Anyone can log help searches" ON public.help_search_logs;
CREATE POLICY "Users log their own help searches" ON public.help_search_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND length(search_query) BETWEEN 1 AND 500);

-- Integration logs
DROP POLICY IF EXISTS "Anyone can insert integration logs" ON public.integration_logs;
CREATE POLICY "Widgets log events for listed or managed properties" ON public.integration_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (length(integration_type) <= 60 AND length(event) <= 60
    AND pg_column_size(metadata) < 8000
    AND (EXISTS (SELECT 1 FROM public.public_properties pp WHERE pp.id = integration_logs.property_id)
         OR public.can_access_property(property_id, auth.uid())));

-- NightsBridge sessions
DROP POLICY IF EXISTS "Anyone can create booking sessions" ON public.nightsbridge_booking_sessions;
CREATE POLICY "Anyone can start an unmatched booking session" ON public.nightsbridge_booking_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (matched_reservation_id IS NULL AND matched_at IS NULL AND match_confidence IS NULL
    AND estimated_revenue IS NULL AND length(tracking_ref) BETWEEN 4 AND 120
    AND coalesce(length(user_agent), 0) <= 1000);

-- Read restrictions
DROP POLICY IF EXISTS "Authenticated users can view field registry" ON public.field_registry;
CREATE POLICY "Signed-in members can view field registry" ON public.field_registry
  FOR SELECT TO authenticated
  USING (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

DROP POLICY IF EXISTS "Signed-in users can read gateway billing schedules" ON public.gateway_billing_configs;
CREATE POLICY "Staff read gateway billing schedules" ON public.gateway_billing_configs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role) OR public.manages_any_property(auth.uid()));

DROP POLICY IF EXISTS "Anyone can view charge presets" ON public.charge_presets;
CREATE POLICY "Signed-in members view charge presets" ON public.charge_presets
  FOR SELECT TO authenticated
  USING (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

DROP POLICY IF EXISTS "Anyone can read gateway registry" ON public.payment_gateway_registry;
CREATE POLICY "Staff read gateway registry" ON public.payment_gateway_registry
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role) OR public.manages_any_property(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view RU channel creators" ON public.ru_channel_creators;
CREATE POLICY "Platform staff view channel creators" ON public.ru_channel_creators
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role));

DROP POLICY IF EXISTS "Public read access" ON public.property_review_cache;
CREATE POLICY "Reviews readable for listed or managed properties" ON public.property_review_cache
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.public_properties pp WHERE pp.id = property_review_cache.property_id)
    OR public.can_access_property(property_id, auth.uid()));

-- Avatar replacement must stay in own folder
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'property-images' AND name LIKE ('avatars/' || auth.uid()::text || '%'))
  WITH CHECK (bucket_id = 'property-images' AND name LIKE ('avatars/' || auth.uid()::text || '%'));