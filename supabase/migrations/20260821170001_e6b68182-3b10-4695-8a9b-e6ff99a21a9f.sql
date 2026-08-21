CREATE TABLE public.report_snapshots (
  run_id uuid NOT NULL PRIMARY KEY REFERENCES public.report_runs(id) ON DELETE CASCADE,
  months jsonb NOT NULL DEFAULT '[]'::jsonb,
  otb_revenue jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_otb_revenue jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_year_actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  room_nights jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_room_nights jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_year_room_nights jsonb NOT NULL DEFAULT '{}'::jsonb,
  capacity_days jsonb NOT NULL DEFAULT '{}'::jsonb,
  additional_revenue jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  adr jsonb NOT NULL DEFAULT '{}'::jsonb,
  occupancy jsonb NOT NULL DEFAULT '{}'::jsonb,
  non_sellable jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  room_count integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_snapshots TO authenticated;
GRANT ALL ON public.report_snapshots TO service_role;
ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports staff manage snapshots"
ON public.report_snapshots FOR ALL TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));

CREATE TABLE public.report_additional_inputs (
  run_id uuid NOT NULL PRIMARY KEY REFERENCES public.report_runs(id) ON DELETE CASCADE,
  dinner_by_month jsonb NOT NULL DEFAULT '{}'::jsonb,
  room0_by_month jsonb NOT NULL DEFAULT '{}'::jsonb,
  comp_rns_by_month jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_stay_notes text,
  promotions_notes text,
  rate_override_notes text,
  free_commentary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_additional_inputs TO authenticated;
GRANT ALL ON public.report_additional_inputs TO service_role;
ALTER TABLE public.report_additional_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports staff manage additional inputs"
ON public.report_additional_inputs FOR ALL TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));

CREATE TABLE public.property_report_settings (
  property_id uuid NOT NULL PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  room_count integer NOT NULL DEFAULT 1,
  report_logo_url text,
  cover_artwork_url text,
  brand_primary text,
  brand_secondary text,
  historical_baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_source_type text NOT NULL DEFAULT 'nightsbridge',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_report_settings TO authenticated;
GRANT ALL ON public.property_report_settings TO service_role;
ALTER TABLE public.property_report_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports staff manage property report settings"
ON public.property_report_settings FOR ALL TO authenticated
USING (public.has_reports_access(auth.uid()))
WITH CHECK (public.has_reports_access(auth.uid()));

ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS excel_path text,
  ADD COLUMN IF NOT EXISTS excel_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE TRIGGER update_report_snapshots_updated_at
BEFORE UPDATE ON public.report_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_report_additional_inputs_updated_at
BEFORE UPDATE ON public.report_additional_inputs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_property_report_settings_updated_at
BEFORE UPDATE ON public.property_report_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();