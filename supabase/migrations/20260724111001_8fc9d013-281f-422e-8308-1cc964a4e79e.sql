
-- 1. Add ru_push_enabled column to properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ru_push_enabled boolean NOT NULL DEFAULT false;

-- Back-fill: any ROLOS-PMS property that is active should be enabled
UPDATE public.properties
   SET ru_push_enabled = true
 WHERE ru_push_enabled = false
   AND COALESCE(is_active, true) = true
   AND (external_system = 'rolos' OR is_rol_property = true);

-- 2. Auto-activation trigger: flip ru_push_enabled on when PMS transitions to ROLOS
CREATE OR REPLACE FUNCTION public.auto_enable_ru_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (COALESCE(NEW.external_system, '') = 'rolos' OR COALESCE(NEW.is_rol_property, false) = true)
     AND COALESCE(NEW.is_active, true) = true
     AND (
       TG_OP = 'INSERT'
       OR COALESCE(OLD.external_system, '') IS DISTINCT FROM COALESCE(NEW.external_system, '')
       OR COALESCE(OLD.is_rol_property, false) IS DISTINCT FROM COALESCE(NEW.is_rol_property, false)
     )
  THEN
    NEW.ru_push_enabled := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_enable_ru_push ON public.properties;
CREATE TRIGGER trg_auto_enable_ru_push
BEFORE INSERT OR UPDATE OF external_system, is_rol_property, is_active
ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.auto_enable_ru_push();

-- 3. ru_sync_runs observability table
CREATE TABLE IF NOT EXISTS public.ru_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  action text NOT NULL,               -- push_property | push_availability | push_prices | subscribe_notifications | pull_reservations
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  ru_property_id text,
  unit_id uuid,
  success boolean NOT NULL,
  http_status integer,
  error_code text,
  error_message text,
  elapsed_ms integer,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ru_sync_runs TO authenticated;
GRANT ALL ON public.ru_sync_runs TO service_role;

ALTER TABLE public.ru_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ru_sync_runs_admin_read"
  ON public.ru_sync_runs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_ru_sync_runs_batch ON public.ru_sync_runs(batch_id);
CREATE INDEX IF NOT EXISTS idx_ru_sync_runs_property_created ON public.ru_sync_runs(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ru_sync_runs_action_created ON public.ru_sync_runs(action, created_at DESC);
