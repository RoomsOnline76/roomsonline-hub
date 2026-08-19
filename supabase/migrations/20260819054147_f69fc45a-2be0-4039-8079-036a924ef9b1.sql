CREATE TABLE public.property_channel_step_status (
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','blocked','passed','stale','unknown')),
  blocker_summary text NULL,
  input_fingerprint text NULL,
  source text NULL CHECK (source IS NULL OR source IN ('local','channel_probe','push_result','manual_signoff','seed')),
  passed_at timestamptz NULL,
  stale_at timestamptz NULL,
  last_checked_at timestamptz NULL,
  details jsonb NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, step_key)
);

CREATE INDEX idx_property_channel_step_status_property ON public.property_channel_step_status(property_id);

GRANT SELECT ON public.property_channel_step_status TO authenticated;
GRANT ALL ON public.property_channel_step_status TO service_role;

ALTER TABLE public.property_channel_step_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage channel step ledger"
ON public.property_channel_step_status
FOR ALL
TO authenticated
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

CREATE POLICY "Property members view channel step ledger"
ON public.property_channel_step_status
FOR SELECT
TO authenticated
USING (public.can_access_property(property_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.preserve_channel_step_passed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();

  IF NEW.status = 'passed' THEN
    NEW.passed_at = COALESCE(NEW.passed_at, now());
  ELSE
    -- never lose the historical pass timestamp
    NEW.passed_at = COALESCE(NEW.passed_at, CASE WHEN TG_OP = 'UPDATE' THEN OLD.passed_at ELSE NULL END);
    IF TG_OP = 'UPDATE' AND OLD.passed_at IS NOT NULL THEN
      NEW.passed_at = OLD.passed_at;
    END IF;
  END IF;

  IF NEW.status = 'stale' THEN
    NEW.stale_at = COALESCE(NEW.stale_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_property_channel_step_status_guard
BEFORE INSERT OR UPDATE ON public.property_channel_step_status
FOR EACH ROW EXECUTE FUNCTION public.preserve_channel_step_passed_at();