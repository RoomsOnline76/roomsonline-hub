-- Property Charges Table
CREATE TABLE property_charges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  internal_code VARCHAR(50),
  category VARCHAR(20) CHECK (category IN ('tax', 'fee', 'deposit', 'surcharge', 'custom')) NOT NULL,
  
  -- Calculation
  calculation_method VARCHAR(30) CHECK (calculation_method IN (
    'flat_per_stay',
    'per_night',
    'per_room_per_night',
    'per_person',
    'per_person_per_night',
    'percentage_of_accommodation'
  )) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'ZAR',
  percentage_apply_to VARCHAR(50) DEFAULT 'subtotal',
  min_cap DECIMAL(10,2),
  max_cap DECIMAL(10,2),
  
  -- Applicability
  applies_to_all_rooms BOOLEAN DEFAULT true,
  room_type_ids UUID[] DEFAULT '{}',
  rate_type_ids UUID[] DEFAULT '{}',
  
  -- Conditions
  min_nights INTEGER DEFAULT 0,
  max_nights INTEGER DEFAULT 0,
  applies_to_adults BOOLEAN DEFAULT true,
  applies_to_children BOOLEAN DEFAULT false,
  applies_to_infants BOOLEAN DEFAULT false,
  
  -- Refund Behavior
  is_refundable BOOLEAN DEFAULT false,
  refund_timing VARCHAR(20) CHECK (refund_timing IN ('on_checkout', 'after_inspection', 'manual')),
  refund_type VARCHAR(20) CHECK (refund_type IN ('full', 'partial')),
  partial_refund_percentage DECIMAL(5,2),
  
  -- Metadata
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  pms_external_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for property lookups
CREATE INDEX idx_property_charges_property ON property_charges(property_id);

-- RLS policies for property_charges
ALTER TABLE property_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view charges for active properties"
  ON property_charges FOR SELECT
  USING (is_property_active(property_id));

CREATE POLICY "Admins and devs can manage all charges"
  ON property_charges FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Owners can manage own property charges"
  ON property_charges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN profiles pr ON p.owner_email = pr.email
      WHERE p.id = property_charges.property_id
      AND pr.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN profiles pr ON p.owner_email = pr.email
      WHERE p.id = property_charges.property_id
      AND pr.id = auth.uid()
    )
  );

-- Charge Presets Table
CREATE TABLE charge_presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL,
  default_calculation_method VARCHAR(30),
  default_description TEXT,
  is_common BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for charge_presets (read-only for most users)
ALTER TABLE charge_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view charge presets"
  ON charge_presets FOR SELECT
  USING (true);

CREATE POLICY "Admins and devs can manage charge presets"
  ON charge_presets FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- Pre-populate with industry standards
INSERT INTO charge_presets (name, category, default_calculation_method, default_description, display_order) VALUES
  ('VAT / Sales Tax', 'tax', 'percentage_of_accommodation', 'Value Added Tax', 1),
  ('Tourism Levy', 'tax', 'percentage_of_accommodation', 'Local tourism promotion fee', 2),
  ('Cleaning Fee', 'fee', 'flat_per_stay', 'One-time cleaning service', 3),
  ('Security Deposit', 'deposit', 'flat_per_stay', 'Refundable damage deposit', 4),
  ('Resort Fee', 'fee', 'per_night', 'Access to resort amenities', 5),
  ('Extra Guest Fee', 'surcharge', 'per_person_per_night', 'Additional guest charge', 6),
  ('Pet Fee', 'surcharge', 'flat_per_stay', 'Pet accommodation fee', 7),
  ('Late Check-out Fee', 'fee', 'flat_per_stay', 'Extended checkout time', 8),
  ('Airport Transfer', 'fee', 'flat_per_stay', 'Return airport transfer', 9);

-- Add charges_breakdown column to bookings
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS charges_breakdown JSONB DEFAULT '{}';

COMMENT ON COLUMN bookings.charges_breakdown IS 
  'Frozen snapshot of charges at booking time for immutability';