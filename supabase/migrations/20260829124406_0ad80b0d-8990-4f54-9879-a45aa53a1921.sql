CREATE TABLE public.report_ledger_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  as_of_date date NOT NULL,
  month text NOT NULL,
  fingerprint text NOT NULL,
  revenue numeric NOT NULL DEFAULT 0,
  nights integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.report_ledger_fingerprints TO authenticated;
GRANT ALL ON public.report_ledger_fingerprints TO service_role;

ALTER TABLE public.report_ledger_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports staff read ledger fingerprints"
ON public.report_ledger_fingerprints FOR SELECT TO authenticated
USING (public.has_reports_access(auth.uid()));

CREATE INDEX report_ledger_fingerprints_lookup_idx ON public.report_ledger_fingerprints (property_id, as_of_date);
CREATE INDEX report_ledger_fingerprints_fingerprint_idx ON public.report_ledger_fingerprints (fingerprint);
CREATE INDEX report_ledger_fingerprints_run_idx ON public.report_ledger_fingerprints (run_id);