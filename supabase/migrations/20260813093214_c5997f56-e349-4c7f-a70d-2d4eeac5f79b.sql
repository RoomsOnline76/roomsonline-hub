CREATE TABLE public.nb_import_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL,
  created_by UUID,
  file_name TEXT,
  file_bytes INTEGER,
  mode TEXT NOT NULL DEFAULT 'live',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  skipped JSONB NOT NULL DEFAULT '[]'::jsonb,
  unmapped_rooms TEXT[] NOT NULL DEFAULT '{}',
  min_arrival DATE,
  max_arrival DATE,
  future_stays INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nb_import_runs TO authenticated;
GRANT ALL ON public.nb_import_runs TO service_role;

ALTER TABLE public.nb_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View import runs for accessible properties"
  ON public.nb_import_runs FOR SELECT
  TO authenticated
  USING (public.can_access_property(property_id, auth.uid()));

CREATE POLICY "Create import runs for accessible properties"
  ON public.nb_import_runs FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_property(property_id, auth.uid()));

CREATE INDEX idx_nb_import_runs_property_created ON public.nb_import_runs (property_id, created_at DESC);

CREATE TRIGGER update_nb_import_runs_updated_at
  BEFORE UPDATE ON public.nb_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();