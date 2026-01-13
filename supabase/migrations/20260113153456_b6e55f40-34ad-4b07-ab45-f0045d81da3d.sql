-- Create property_commercial_terms table for revenue share contracts
CREATE TABLE property_commercial_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) NOT NULL,
  revenue_share_percent numeric(5,2) DEFAULT 10.00 NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  contract_status text DEFAULT 'active' 
    CHECK (contract_status IN ('draft', 'active', 'suspended', 'terminated')),
  signed_at timestamptz,
  signed_by text,
  document_url text,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE property_commercial_terms ENABLE ROW LEVEL SECURITY;

-- Indexes for efficient lookups
CREATE INDEX idx_commercial_terms_property_status 
  ON property_commercial_terms(property_id, contract_status);
CREATE INDEX idx_commercial_terms_effective_dates 
  ON property_commercial_terms(effective_from, effective_to);

-- RLS: Admin/dev can view all commercial terms
CREATE POLICY "Admin/dev read commercial terms"
  ON property_commercial_terms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'dev')
    )
  );

-- RLS: Admin/dev can manage commercial terms
CREATE POLICY "Admin/dev manage commercial terms"
  ON property_commercial_terms FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'dev')
    )
  );

CREATE POLICY "Admin/dev update commercial terms"
  ON property_commercial_terms FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'dev')
    )
  );

CREATE POLICY "Admin/dev delete commercial terms"
  ON property_commercial_terms FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'dev')
    )
  );

-- Add commission tracking columns to bookings
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS calculated_commission numeric(10,2),
  ADD COLUMN IF NOT EXISTS commission_rate_applied numeric(5,2),
  ADD COLUMN IF NOT EXISTS commission_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_channel text;

-- Create updated_at trigger for commercial terms
CREATE TRIGGER update_commercial_terms_updated_at
  BEFORE UPDATE ON property_commercial_terms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to check if user can view ROL pulse
CREATE OR REPLACE FUNCTION can_view_rol_pulse(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = $1 AND role IN ('admin', 'dev')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;