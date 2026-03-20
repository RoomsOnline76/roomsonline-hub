
-- Webhook subscriptions table
CREATE TABLE public.rolos_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rolos_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage webhook subscriptions"
  ON public.rolos_webhook_subscriptions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  );

-- Webhook delivery logs table
CREATE TABLE public.rolos_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.rolos_webhook_subscriptions(id) ON DELETE SET NULL,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB,
  response_status INT,
  response_body TEXT,
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

ALTER TABLE public.rolos_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can view webhook logs"
  ON public.rolos_webhook_logs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  );

-- Index for efficient log queries
CREATE INDEX idx_webhook_logs_status ON public.rolos_webhook_logs(status) WHERE status = 'pending';
CREATE INDEX idx_webhook_logs_property ON public.rolos_webhook_logs(property_id, created_at DESC);
CREATE INDEX idx_webhook_subs_property ON public.rolos_webhook_subscriptions(property_id) WHERE is_active = true;
