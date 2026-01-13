-- Contract Templates Management
CREATE TABLE public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  current_version_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contract Template Versions (immutable once activated)
CREATE TABLE public.contract_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.contract_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content_markdown TEXT NOT NULL,
  variables_schema JSONB NOT NULL DEFAULT '{}',
  status TEXT CHECK (status IN ('draft', 'active', 'deprecated', 'archived')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES auth.users(id),
  UNIQUE(template_id, version_number)
);

-- Add foreign key for current_version_id after contract_template_versions exists
ALTER TABLE public.contract_templates 
  ADD CONSTRAINT fk_current_version 
  FOREIGN KEY (current_version_id) 
  REFERENCES public.contract_template_versions(id);

-- Link signed contracts to specific template versions
ALTER TABLE public.owner_contracts 
  ADD COLUMN template_version_id UUID REFERENCES public.contract_template_versions(id);

-- Onboarding Wizards Configuration
CREATE TABLE public.onboarding_wizards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Onboarding Steps
CREATE TABLE public.onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wizard_id UUID REFERENCES public.onboarding_wizards(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  is_required BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  component_type TEXT CHECK (component_type IN ('form', 'confirmation', 'custom')) DEFAULT 'form',
  custom_component_path TEXT,
  icon TEXT DEFAULT 'FileText',
  estimated_minutes INTEGER DEFAULT 5,
  weight INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(wizard_id, step_key)
);

-- Onboarding Fields (configurable per step)
CREATE TABLE public.onboarding_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID REFERENCES public.onboarding_steps(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label_override TEXT,
  help_text TEXT,
  is_required BOOLEAN DEFAULT false,
  is_pms_lockable BOOLEAN DEFAULT false,
  score_weight INTEGER DEFAULT 0 CHECK (score_weight >= 0 AND score_weight <= 100),
  order_index INTEGER NOT NULL,
  validation_rules JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(step_id, field_key)
);

-- Field Registry (synced from property-form-field-map.json)
CREATE TABLE public.field_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT UNIQUE NOT NULL,
  ui_label TEXT NOT NULL,
  db_table TEXT,
  db_column TEXT,
  data_type TEXT,
  is_required BOOLEAN DEFAULT false,
  pms_populated BOOLEAN DEFAULT false,
  pms_lockable BOOLEAN DEFAULT false,
  section TEXT,
  tab TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Wizard Audit Log
CREATE TABLE public.wizard_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT CHECK (entity_type IN ('wizard', 'step', 'field', 'template', 'template_version')),
  entity_id UUID NOT NULL,
  action TEXT CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate')),
  before_state JSONB,
  after_state JSONB,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_wizards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wizard_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contract_templates (admin/dev only)
CREATE POLICY "Admin/Dev can view contract templates"
ON public.contract_templates FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can insert contract templates"
ON public.contract_templates FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can update contract templates"
ON public.contract_templates FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can delete contract templates"
ON public.contract_templates FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- RLS Policies for contract_template_versions
CREATE POLICY "Admin/Dev can view contract versions"
ON public.contract_template_versions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can insert contract versions"
ON public.contract_template_versions FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can update contract versions"
ON public.contract_template_versions FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- RLS Policies for onboarding_wizards
CREATE POLICY "Admin/Dev can view wizards"
ON public.onboarding_wizards FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can insert wizards"
ON public.onboarding_wizards FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can update wizards"
ON public.onboarding_wizards FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can delete wizards"
ON public.onboarding_wizards FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- RLS Policies for onboarding_steps
CREATE POLICY "Admin/Dev can view steps"
ON public.onboarding_steps FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can manage steps"
ON public.onboarding_steps FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- RLS Policies for onboarding_fields
CREATE POLICY "Admin/Dev can view fields"
ON public.onboarding_fields FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

CREATE POLICY "Admin/Dev can manage fields"
ON public.onboarding_fields FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- RLS Policies for field_registry (read for all authenticated, write for admin/dev)
CREATE POLICY "Authenticated users can view field registry"
ON public.field_registry FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admin/Dev can manage field registry"
ON public.field_registry FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- RLS Policies for wizard_audit_log
CREATE POLICY "Authenticated can insert audit logs"
ON public.wizard_audit_log FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admin/Dev can view audit logs"
ON public.wizard_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- Triggers for updated_at
CREATE TRIGGER update_contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_onboarding_wizards_updated_at
  BEFORE UPDATE ON public.onboarding_wizards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_onboarding_steps_updated_at
  BEFORE UPDATE ON public.onboarding_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_onboarding_fields_updated_at
  BEFORE UPDATE ON public.onboarding_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_field_registry_updated_at
  BEFORE UPDATE ON public.field_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to log wizard audit changes
CREATE OR REPLACE FUNCTION public.log_wizard_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entity_type TEXT;
  _action TEXT;
BEGIN
  -- Determine entity type based on table
  _entity_type := CASE TG_TABLE_NAME
    WHEN 'onboarding_wizards' THEN 'wizard'
    WHEN 'onboarding_steps' THEN 'step'
    WHEN 'onboarding_fields' THEN 'field'
    WHEN 'contract_templates' THEN 'template'
    WHEN 'contract_template_versions' THEN 'template_version'
    ELSE TG_TABLE_NAME
  END;

  -- Determine action
  _action := LOWER(TG_OP);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.wizard_audit_log (entity_type, entity_id, action, after_state, changed_by)
    VALUES (_entity_type, NEW.id, _action, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.wizard_audit_log (entity_type, entity_id, action, before_state, after_state, changed_by)
    VALUES (_entity_type, NEW.id, _action, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.wizard_audit_log (entity_type, entity_id, action, before_state, changed_by)
    VALUES (_entity_type, OLD.id, _action, to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Apply audit triggers
CREATE TRIGGER audit_contract_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.log_wizard_audit();

CREATE TRIGGER audit_contract_template_versions
  AFTER INSERT OR UPDATE OR DELETE ON public.contract_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.log_wizard_audit();

CREATE TRIGGER audit_onboarding_wizards
  AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_wizards
  FOR EACH ROW EXECUTE FUNCTION public.log_wizard_audit();

CREATE TRIGGER audit_onboarding_steps
  AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.log_wizard_audit();

CREATE TRIGGER audit_onboarding_fields
  AFTER INSERT OR UPDATE OR DELETE ON public.onboarding_fields
  FOR EACH ROW EXECUTE FUNCTION public.log_wizard_audit();