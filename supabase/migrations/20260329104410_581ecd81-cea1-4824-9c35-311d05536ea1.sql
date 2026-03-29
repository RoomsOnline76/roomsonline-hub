
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_rep';

CREATE TABLE public.sales_rep_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_id uuid REFERENCES public.sales_reps(id) ON DELETE CASCADE NOT NULL UNIQUE,
  bank_name text NOT NULL,
  branch_code text,
  account_holder text NOT NULL,
  account_number_encrypted bytea,
  account_number_masked text,
  account_type text DEFAULT 'cheque',
  swift_code text,
  is_verified boolean DEFAULT false,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sales_rep_bank_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage rep banking" ON public.sales_rep_bank_details
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'));

CREATE POLICY "Rep views own banking" ON public.sales_rep_bank_details
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales_reps WHERE id = rep_id AND user_id = auth.uid()
  ));
