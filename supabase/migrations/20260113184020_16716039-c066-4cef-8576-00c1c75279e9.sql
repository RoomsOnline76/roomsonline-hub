-- Phase 1: ROL Bank Export System - The Ledger Foundation
-- This migration creates the immutable financial infrastructure for payouts

-- =====================================================
-- TABLE 1: rol_revenue_ledger (Single Source of Truth)
-- =====================================================
CREATE TABLE public.rol_revenue_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source tracking
  source_type text NOT NULL CHECK (source_type IN ('booking', 'adjustment', 'refund', 'fee')),
  source_id uuid NOT NULL,
  
  -- Property linkage
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  
  -- Financial amounts (all in ZAR, 2 decimal precision)
  gross_amount numeric(12,2) NOT NULL,
  commission_amount numeric(12,2) NOT NULL,
  net_amount numeric(12,2) NOT NULL GENERATED ALWAYS AS (gross_amount - commission_amount) STORED,
  commission_rate numeric(5,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  
  -- Status workflow
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'eligible', 'locked', 'exported', 'reversed')),
  
  -- Eligibility tracking
  eligible_at timestamptz,
  escrow_release_date date,
  
  -- Export tracking
  export_batch_id uuid,
  exported_at timestamptz,
  
  -- Reversal tracking
  reverses_ledger_id uuid REFERENCES public.rol_revenue_ledger(id),
  reversal_reason text,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Idempotency & Immutability
  idempotency_key text UNIQUE NOT NULL,
  immutable_hash text NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_ledger_property ON public.rol_revenue_ledger(property_id);
CREATE INDEX idx_ledger_status ON public.rol_revenue_ledger(status);
CREATE INDEX idx_ledger_source ON public.rol_revenue_ledger(source_type, source_id);
CREATE INDEX idx_ledger_export_batch ON public.rol_revenue_ledger(export_batch_id) WHERE export_batch_id IS NOT NULL;
CREATE INDEX idx_ledger_eligible ON public.rol_revenue_ledger(status, escrow_release_date) WHERE status = 'pending';

-- =====================================================
-- TABLE 2: rol_bank_export_batches
-- =====================================================
CREATE SEQUENCE IF NOT EXISTS public.rol_batch_sequence START 1;

CREATE TABLE public.rol_bank_export_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Human-readable reference
  batch_reference text UNIQUE NOT NULL,
  batch_sequence integer NOT NULL DEFAULT nextval('public.rol_batch_sequence'),
  
  -- Bank configuration
  bank_provider text NOT NULL CHECK (bank_provider IN ('standard_bank', 'absa', 'fnb', 'nedbank')),
  export_format text NOT NULL DEFAULT 'CSV',
  
  -- Totals (for validation/checksum)
  total_records integer NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  
  -- Workflow status
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'awaiting_signoff', 'approved', 'exported', 'failed', 'cancelled')),
  
  -- Creator
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Export tracking
  exported_at timestamptz,
  exported_by uuid REFERENCES auth.users(id),
  export_file_url text,
  
  -- Failure tracking
  failed_at timestamptz,
  failure_reason text,
  
  -- Audit
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_batches_status ON public.rol_bank_export_batches(status);
CREATE INDEX idx_batches_created_by ON public.rol_bank_export_batches(created_by);

-- =====================================================
-- TABLE 3: rol_bank_export_lines
-- =====================================================
CREATE TABLE public.rol_bank_export_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.rol_bank_export_batches(id) ON DELETE CASCADE,
  
  -- Beneficiary (property owner)
  property_id uuid NOT NULL REFERENCES public.properties(id),
  beneficiary_name text NOT NULL,
  
  -- Bank details
  bank_name text NOT NULL,
  branch_code text NOT NULL,
  account_number_encrypted text NOT NULL,
  account_number_masked text NOT NULL,
  
  -- Payment amount
  amount numeric(12,2) NOT NULL CHECK (amount >= 500),
  currency text NOT NULL DEFAULT 'ZAR',
  
  -- Reference (unique per bank submission)
  payment_reference text UNIQUE NOT NULL,
  
  -- Traceability
  ledger_ids uuid[] NOT NULL,
  ledger_count integer NOT NULL,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed', 'reversed')),
  
  -- Failure tracking
  failure_reason text,
  failure_code text,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_export_lines_batch ON public.rol_bank_export_lines(batch_id);
CREATE INDEX idx_export_lines_property ON public.rol_bank_export_lines(property_id);

-- =====================================================
-- TABLE 4: rol_financial_signoffs (Dual Sign-off)
-- =====================================================
CREATE TABLE public.rol_financial_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.rol_bank_export_batches(id) ON DELETE CASCADE,
  
  -- Who signed
  user_id uuid NOT NULL REFERENCES auth.users(id),
  user_email text NOT NULL,
  user_role text NOT NULL CHECK (user_role IN ('fearless_leader', 'dev')),
  
  -- When signed
  signed_at timestamptz NOT NULL DEFAULT now(),
  
  -- Non-repudiation
  ip_address text NOT NULL,
  ip_hash text NOT NULL,
  user_agent text,
  
  -- Cryptographic proof
  signature_hash text NOT NULL,
  
  -- Acknowledgment text
  acknowledgment_text text NOT NULL,
  
  UNIQUE(batch_id, user_role)
);

CREATE INDEX idx_signoffs_batch ON public.rol_financial_signoffs(batch_id);

-- =====================================================
-- TABLE 5: property_bank_details (Encrypted)
-- =====================================================
CREATE TABLE public.property_bank_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid UNIQUE NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  
  -- Bank information
  bank_name text NOT NULL,
  branch_code text NOT NULL,
  account_holder text NOT NULL,
  account_number_encrypted text NOT NULL,
  account_number_masked text NOT NULL,
  account_type text,
  swift_code text,
  
  -- Verification status
  is_verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  verification_method text,
  
  -- Audit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_bank_details_property ON public.property_bank_details(property_id);
CREATE INDEX idx_bank_details_verified ON public.property_bank_details(is_verified) WHERE is_verified = true;

-- =====================================================
-- ENABLE RLS ON ALL TABLES
-- =====================================================
ALTER TABLE public.rol_revenue_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_bank_export_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_bank_export_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_financial_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_bank_details ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: rol_revenue_ledger
-- =====================================================

-- Dev and Fearless Leader can view all ledger entries
CREATE POLICY "Dev/FL view all ledger" ON public.rol_revenue_ledger
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR 
    public.has_role(auth.uid(), 'fearless_leader')
  );

-- Owners can view their own property ledger entries
CREATE POLICY "Owners view own ledger" ON public.rol_revenue_ledger
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      JOIN public.profiles pr ON p.owner_email = pr.email
      WHERE p.id = rol_revenue_ledger.property_id
      AND pr.id = auth.uid()
    )
  );

-- =====================================================
-- RLS POLICIES: rol_bank_export_batches
-- =====================================================

-- Dev/FL can view all batches
CREATE POLICY "Dev/FL view batches" ON public.rol_bank_export_batches
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR 
    public.has_role(auth.uid(), 'fearless_leader')
  );

-- Dev/FL can create batches
CREATE POLICY "Dev/FL create batches" ON public.rol_bank_export_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'dev') OR 
    public.has_role(auth.uid(), 'fearless_leader')
  );

-- Dev/FL can update batches
CREATE POLICY "Dev/FL update batches" ON public.rol_bank_export_batches
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR 
    public.has_role(auth.uid(), 'fearless_leader')
  );

-- =====================================================
-- RLS POLICIES: rol_bank_export_lines
-- =====================================================

-- Dev/FL can view all export lines
CREATE POLICY "Dev/FL view export lines" ON public.rol_bank_export_lines
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR 
    public.has_role(auth.uid(), 'fearless_leader')
  );

-- =====================================================
-- RLS POLICIES: rol_financial_signoffs
-- =====================================================

-- Dev/FL can view signoffs
CREATE POLICY "Dev/FL view signoffs" ON public.rol_financial_signoffs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR 
    public.has_role(auth.uid(), 'fearless_leader')
  );

-- Dev/FL can insert their own signoffs
CREATE POLICY "Dev/FL insert own signoffs" ON public.rol_financial_signoffs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    (public.has_role(auth.uid(), 'dev') OR public.has_role(auth.uid(), 'fearless_leader'))
  );

-- =====================================================
-- RLS POLICIES: property_bank_details
-- =====================================================

-- Dev/FL/Admin can view all bank details
CREATE POLICY "Staff view bank details" ON public.property_bank_details
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR 
    public.has_role(auth.uid(), 'fearless_leader') OR
    public.has_role(auth.uid(), 'admin')
  );

-- Dev/FL/Admin can manage bank details
CREATE POLICY "Staff manage bank details" ON public.property_bank_details
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev') OR 
    public.has_role(auth.uid(), 'fearless_leader') OR
    public.has_role(auth.uid(), 'admin')
  );

-- Owners can view their own property bank details
CREATE POLICY "Owners view own bank details" ON public.property_bank_details
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      JOIN public.profiles pr ON p.owner_email = pr.email
      WHERE p.id = property_bank_details.property_id
      AND pr.id = auth.uid()
    )
  );

-- =====================================================
-- TRIGGER: Update timestamps
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_bank_export_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_updated_at
  BEFORE UPDATE ON public.rol_revenue_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_bank_export_updated_at();

CREATE TRIGGER trg_batches_updated_at
  BEFORE UPDATE ON public.rol_bank_export_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_bank_export_updated_at();

CREATE TRIGGER trg_bank_details_updated_at
  BEFORE UPDATE ON public.property_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.update_bank_export_updated_at();

-- =====================================================
-- FUNCTION: Generate batch reference
-- =====================================================
CREATE OR REPLACE FUNCTION public.generate_batch_reference()
RETURNS TRIGGER AS $$
BEGIN
  NEW.batch_reference := 'ROL-BATCH-' || to_char(NOW(), 'YYYY') || '-' || LPAD(NEW.batch_sequence::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_batch_reference
  BEFORE INSERT ON public.rol_bank_export_batches
  FOR EACH ROW EXECUTE FUNCTION public.generate_batch_reference();