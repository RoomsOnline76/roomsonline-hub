-- ── RU certification runs ────────────────────────────────
CREATE TABLE public.ru_cert_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  suite TEXT NOT NULL DEFAULT 'read_only',
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  ru_property_id TEXT,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ru_cert_runs TO authenticated;
GRANT ALL ON public.ru_cert_runs TO service_role;

ALTER TABLE public.ru_cert_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view RU cert runs"
ON public.ru_cert_runs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE INDEX idx_ru_cert_runs_started_at ON public.ru_cert_runs (started_at DESC);

-- ── RU discounts ─────────────────────────────────────────
CREATE TABLE public.ru_discounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('long_stay', 'last_minute')),
  threshold INTEGER NOT NULL CHECK (threshold > 0),
  discount_percent NUMERIC(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent < 100),
  date_from DATE,
  date_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, discount_type, threshold, date_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ru_discounts TO authenticated;
GRANT ALL ON public.ru_discounts TO service_role;

ALTER TABLE public.ru_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Property access can view RU discounts"
ON public.ru_discounts FOR SELECT TO authenticated
USING (public.can_access_property(property_id, auth.uid()));

CREATE POLICY "Property access can manage RU discounts"
ON public.ru_discounts FOR ALL TO authenticated
USING (public.can_access_property(property_id, auth.uid()))
WITH CHECK (public.can_access_property(property_id, auth.uid()));

CREATE INDEX idx_ru_discounts_property ON public.ru_discounts (property_id, discount_type);

CREATE TRIGGER update_ru_cert_runs_updated_at
BEFORE UPDATE ON public.ru_cert_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ru_discounts_updated_at
BEFORE UPDATE ON public.ru_discounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();