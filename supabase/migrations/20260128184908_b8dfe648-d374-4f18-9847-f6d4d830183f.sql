-- Phase 1: Enhanced Property Listing Process - Database Schema Foundation (Fixed)

-- 1.1 Add new status and intent fields to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS listing_status TEXT DEFAULT 'draft_pre_contract'
  CHECK (listing_status IN ('draft_pre_contract', 'contract_sent', 'contract_signed', 
                            'onboarding_active', 'review_pending', 'activation_ready', 'live', 'inactive'));

ALTER TABLE properties ADD COLUMN IF NOT EXISTS listing_intent TEXT 
  CHECK (listing_intent IN ('accommodation', 'venue', 'hybrid', 'experience'));

ALTER TABLE properties ADD COLUMN IF NOT EXISTS commercial_model TEXT
  CHECK (commercial_model IN ('commission', 'flat_fee', 'special'));

ALTER TABLE properties ADD COLUMN IF NOT EXISTS pms_readiness TEXT DEFAULT 'none'
  CHECK (pms_readiness IN ('none', 'planned', 'connected', 'live'));

ALTER TABLE properties ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES auth.users(id);

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_properties_listing_status ON properties(listing_status);

-- 1.2 Create property_checklist table
CREATE TABLE IF NOT EXISTS property_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE NOT NULL,
  phase TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_label TEXT NOT NULL,
  required_for TEXT[] DEFAULT '{}',
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  auto_verified BOOLEAN DEFAULT false,
  verification_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(property_id, phase, item_key)
);

ALTER TABLE property_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage all checklists" ON property_checklist
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev') OR has_role(auth.uid(), 'fearless_leader'));

CREATE POLICY "Owners can view their property checklists" ON property_checklist
  FOR SELECT TO authenticated
  USING (property_checklist.property_id IN (
    SELECT props.id FROM properties props 
    JOIN profiles profs ON props.owner_email = profs.email 
    WHERE profs.id = auth.uid()
  ));

-- 1.3 Create property_activation_logs table
CREATE TABLE IF NOT EXISTS property_activation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL,
  activated_by UUID REFERENCES auth.users(id),
  pre_activation_score NUMERIC,
  quality_gate_results JSONB,
  post_activation_checks JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE property_activation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage activation logs" ON property_activation_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev') OR has_role(auth.uid(), 'fearless_leader'));

-- 1.4 Create property_onboarding_roadmap table
CREATE TABLE IF NOT EXISTS property_onboarding_roadmap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE UNIQUE,
  roadmap JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE property_onboarding_roadmap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage roadmaps" ON property_onboarding_roadmap
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev') OR has_role(auth.uid(), 'fearless_leader'));

CREATE POLICY "Owners can view their roadmaps" ON property_onboarding_roadmap
  FOR SELECT TO authenticated
  USING (property_onboarding_roadmap.property_id IN (
    SELECT props.id FROM properties props 
    JOIN profiles profs ON props.owner_email = profs.email 
    WHERE profs.id = auth.uid()
  ));

-- Add updated_at trigger for new tables
CREATE TRIGGER update_property_checklist_updated_at
  BEFORE UPDATE ON property_checklist
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_onboarding_roadmap_updated_at
  BEFORE UPDATE ON property_onboarding_roadmap
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();