CREATE TABLE public.ru_fx_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  base_iso text NOT NULL,
  quote_iso text NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0),
  source text NOT NULL DEFAULT 'unknown',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ru_fx_rates_pair_fetched ON public.ru_fx_rates (base_iso, quote_iso, fetched_at DESC);

GRANT SELECT ON public.ru_fx_rates TO authenticated;
GRANT ALL ON public.ru_fx_rates TO service_role;
ALTER TABLE public.ru_fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view FX rates"
  ON public.ru_fx_rates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage FX rates"
  ON public.ru_fx_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'));

CREATE TABLE public.ru_currency_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  ru_location_id integer,
  location_currency_iso text,
  authored_currency_iso text,
  published_currency_iso text,
  conversion_in_force boolean NOT NULL DEFAULT false,
  fx_rate numeric,
  margin_pct numeric NOT NULL DEFAULT 3,
  effective_rate numeric,
  reason text,
  flip_outcome text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id)
);

GRANT SELECT ON public.ru_currency_state TO authenticated;
GRANT ALL ON public.ru_currency_state TO service_role;
ALTER TABLE public.ru_currency_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view RU currency state"
  ON public.ru_currency_state FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage RU currency state"
  ON public.ru_currency_state FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'));

CREATE TRIGGER update_ru_currency_state_updated_at
  BEFORE UPDATE ON public.ru_currency_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();