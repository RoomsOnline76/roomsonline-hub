CREATE TABLE public.ru_readiness_snapshots (
  property_id uuid NOT NULL PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  ru_owner_id bigint,
  groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  probed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ru_readiness_snapshots TO authenticated;
GRANT ALL ON public.ru_readiness_snapshots TO service_role;

ALTER TABLE public.ru_readiness_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view readiness snapshots"
ON public.ru_readiness_snapshots
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
  OR public.can_access_property(property_id, auth.uid())
);

CREATE TRIGGER update_ru_readiness_snapshots_updated_at
BEFORE UPDATE ON public.ru_readiness_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();