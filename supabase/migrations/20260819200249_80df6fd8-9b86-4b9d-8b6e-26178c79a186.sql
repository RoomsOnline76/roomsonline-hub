CREATE TABLE public.owner_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  service text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  portal_id text,
  access_token bytea,
  refresh_token bytea,
  last_sync_at timestamptz,
  sync_status text NOT NULL DEFAULT 'pending',
  last_error text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_integrations_service_check CHECK (service IN ('hubspot')),
  CONSTRAINT owner_integrations_sync_status_check CHECK (sync_status IN ('pending','ok','error')),
  CONSTRAINT owner_integrations_owner_service_key UNIQUE (owner_id, service)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_integrations TO authenticated;
GRANT ALL ON public.owner_integrations TO service_role;

ALTER TABLE public.owner_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their own integrations"
ON public.owner_integrations FOR ALL TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Staff manage all owner integrations"
ON public.owner_integrations FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);

CREATE INDEX idx_owner_integrations_owner ON public.owner_integrations (owner_id, service);

CREATE TRIGGER update_owner_integrations_updated_at
BEFORE UPDATE ON public.owner_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();