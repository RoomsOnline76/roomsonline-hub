
CREATE TABLE public.hyperguest_portal_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  rotated_by uuid,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.hyperguest_portal_config TO authenticated;
GRANT ALL ON public.hyperguest_portal_config TO service_role;
ALTER TABLE public.hyperguest_portal_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage portal config"
  ON public.hyperguest_portal_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'fearless_leader'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'fearless_leader'));

INSERT INTO public.hyperguest_portal_config (id, token)
VALUES (true, encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (id) DO NOTHING;
