
-- Fix the log_wizard_audit function to use 'create' instead of 'insert'
CREATE OR REPLACE FUNCTION public.log_wizard_audit()
RETURNS TRIGGER AS $$
DECLARE
  _action text;
  _entity_type text;
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

  -- Determine action - use 'create' for INSERT to match constraint
  _action := CASE TG_OP
    WHEN 'INSERT' THEN 'create'
    WHEN 'UPDATE' THEN 'update'
    WHEN 'DELETE' THEN 'delete'
  END;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.wizard_audit_log (entity_type, entity_id, action, before_state, changed_by)
    VALUES (_entity_type, OLD.id, _action, to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSE
    INSERT INTO public.wizard_audit_log (entity_type, entity_id, action, after_state, changed_by)
    VALUES (_entity_type, NEW.id, _action, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
