ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'property';

ALTER TABLE public.property_referrals
  ADD COLUMN IF NOT EXISTS first_year_rate_override numeric(5,2),
  ADD COLUMN IF NOT EXISTS residual_rate_override numeric(5,2),
  ADD COLUMN IF NOT EXISTS residual_months_override integer,
  ADD COLUMN IF NOT EXISTS override_notes text;

ALTER TABLE public.rep_commission_entries
  ADD COLUMN IF NOT EXISTS rate_source text;

CREATE TABLE IF NOT EXISTS public.rep_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  template_version_id uuid REFERENCES public.contract_template_versions(id),
  status text NOT NULL DEFAULT 'draft',
  signing_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  sent_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signer_email text,
  signature_data jsonb,
  signed_html text,
  signed_pdf_url text,
  terms_snapshot jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rep_contracts_signing_token_key ON public.rep_contracts(signing_token);
CREATE INDEX IF NOT EXISTS rep_contracts_rep_id_idx ON public.rep_contracts(rep_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_contracts TO authenticated;
GRANT SELECT, UPDATE ON public.rep_contracts TO anon;
GRANT ALL ON public.rep_contracts TO service_role;

ALTER TABLE public.rep_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage rep contracts"
ON public.rep_contracts FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE POLICY "Reps can view their own contract"
ON public.rep_contracts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales_reps sr
    WHERE sr.id = rep_contracts.rep_id AND sr.user_id = auth.uid()
  )
);

CREATE TRIGGER update_rep_contracts_updated_at
BEFORE UPDATE ON public.rep_contracts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();