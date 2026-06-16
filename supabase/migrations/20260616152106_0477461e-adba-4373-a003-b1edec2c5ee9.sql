
CREATE TABLE public.hyperguest_cert_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  property_id uuid,
  sandbox_hotel_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  full_log jsonb,
  exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hyperguest_cert_runs TO service_role;
ALTER TABLE public.hyperguest_cert_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view cert runs"
  ON public.hyperguest_cert_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'fearless_leader'));
CREATE INDEX idx_hg_cert_runs_started ON public.hyperguest_cert_runs(started_at DESC);
