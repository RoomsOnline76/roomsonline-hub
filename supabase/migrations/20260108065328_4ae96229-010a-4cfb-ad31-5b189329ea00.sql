-- =============================================
-- AUDIT SYSTEM MIGRATION
-- =============================================

-- 1. Create enum types
CREATE TYPE public.audit_action_type AS ENUM (
  'create', 'update', 'delete', 'permission_change', 'sync', 'export', 'login', 'other'
);

CREATE TYPE public.audit_request_origin AS ENUM (
  'admin_ui', 'edge_function', 'api', 'cron', 'db_trigger'
);

CREATE TYPE public.audit_user_role AS ENUM (
  'admin', 'dev', 'owner', 'system'
);

-- 2. Create audit_logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Actor Context
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  user_role public.audit_user_role NOT NULL,
  ip_address text,
  user_agent text,
  session_id text,
  
  -- Action Context
  action_type public.audit_action_type NOT NULL,
  table_name text NOT NULL,
  record_id text NOT NULL,
  property_id uuid,
  request_origin public.audit_request_origin NOT NULL,
  edge_function_name text,
  correlation_id text,
  
  -- Change Detail
  old_values jsonb,
  new_values jsonb,
  changed_fields text[],
  change_summary text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Security & Integrity
  is_sensitive boolean DEFAULT false,
  redacted_fields text[],
  immutable_hash text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create performance indexes
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_property_id ON public.audit_logs(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX idx_audit_logs_correlation ON public.audit_logs(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_audit_logs_changed_fields ON public.audit_logs USING gin(changed_fields);
CREATE INDEX idx_audit_logs_action_type ON public.audit_logs(action_type);

-- 4. Enable RLS (append-only, admin/dev read only)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins and devs can view audit logs
CREATE POLICY "Admins and devs can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dev'));

-- No UPDATE or DELETE policies - truly append-only

-- 5. Create helper function to get user role for audit
CREATE OR REPLACE FUNCTION public.get_user_audit_role(_user_id uuid)
RETURNS public.audit_user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.audit_user_role;
BEGIN
  -- Check for dev first (highest privilege)
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'dev') THEN
    RETURN 'dev'::public.audit_user_role;
  END IF;
  
  -- Check for admin
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'admin') THEN
    RETURN 'admin'::public.audit_user_role;
  END IF;
  
  -- Default to owner for authenticated users
  RETURN 'owner'::public.audit_user_role;
END;
$$;

-- 6. Create helper function to get user email
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT email FROM public.profiles WHERE id = _user_id),
    'system@roomsonline.com'
  );
$$;

-- 7. Create the main audit trigger function
CREATE OR REPLACE FUNCTION public.log_audit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _user_email text;
  _user_role public.audit_user_role;
  _action_type public.audit_action_type;
  _old_values jsonb;
  _new_values jsonb;
  _changed_fields text[];
  _change_summary text;
  _property_id uuid;
  _record_id text;
  _is_sensitive boolean := false;
  _redacted_fields text[] := '{}';
  _sensitive_fields text[] := ARRAY['password', 'api_key', 'key_value', 'access_token', 'refresh_token', 'payment_intent_id'];
  _hash_input text;
  _immutable_hash text;
  key_name text;
BEGIN
  -- Get current user from auth context
  _user_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  _user_email := public.get_user_email(_user_id);
  
  -- Determine user role
  IF _user_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    _user_role := 'system'::public.audit_user_role;
  ELSE
    _user_role := public.get_user_audit_role(_user_id);
  END IF;
  
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    _action_type := 'create'::public.audit_action_type;
    _record_id := NEW.id::text;
  ELSIF TG_OP = 'UPDATE' THEN
    _action_type := 'update'::public.audit_action_type;
    _record_id := NEW.id::text;
  ELSIF TG_OP = 'DELETE' THEN
    _action_type := 'delete'::public.audit_action_type;
    _record_id := OLD.id::text;
  END IF;
  
  -- Handle role changes specially
  IF TG_TABLE_NAME = 'user_roles' THEN
    _action_type := 'permission_change'::public.audit_action_type;
  END IF;
  
  -- Convert records to JSONB
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    _old_values := to_jsonb(OLD);
  END IF;
  
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    _new_values := to_jsonb(NEW);
  END IF;
  
  -- Redact sensitive fields
  FOREACH key_name IN ARRAY _sensitive_fields
  LOOP
    IF _old_values ? key_name AND _old_values->>key_name IS NOT NULL AND _old_values->>key_name != '' THEN
      _old_values := _old_values || jsonb_build_object(key_name, '[REDACTED]');
      _is_sensitive := true;
      _redacted_fields := array_append(_redacted_fields, key_name);
    END IF;
    IF _new_values ? key_name AND _new_values->>key_name IS NOT NULL AND _new_values->>key_name != '' THEN
      _new_values := _new_values || jsonb_build_object(key_name, '[REDACTED]');
      _is_sensitive := true;
      IF NOT (key_name = ANY(_redacted_fields)) THEN
        _redacted_fields := array_append(_redacted_fields, key_name);
      END IF;
    END IF;
  END LOOP;
  
  -- Compute changed fields for updates
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key)
    INTO _changed_fields
    FROM (
      SELECT key FROM jsonb_each(to_jsonb(NEW))
      EXCEPT
      SELECT key FROM jsonb_each(to_jsonb(OLD)) WHERE to_jsonb(OLD)->key = to_jsonb(NEW)->key
    ) diff;
    
    -- Remove updated_at from changed fields as it's always changing
    _changed_fields := array_remove(_changed_fields, 'updated_at');
  END IF;
  
  -- Extract property_id if applicable
  IF TG_TABLE_NAME = 'properties' THEN
    _property_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF _new_values ? 'property_id' THEN
    _property_id := (_new_values->>'property_id')::uuid;
  ELSIF _old_values ? 'property_id' THEN
    _property_id := (_old_values->>'property_id')::uuid;
  END IF;
  
  -- Generate change summary
  IF TG_OP = 'INSERT' THEN
    _change_summary := format('Created %s record', TG_TABLE_NAME);
    IF _new_values ? 'name' THEN
      _change_summary := _change_summary || format(': %s', _new_values->>'name');
    ELSIF _new_values ? 'email' THEN
      _change_summary := _change_summary || format(': %s', _new_values->>'email');
    ELSIF _new_values ? 'title' THEN
      _change_summary := _change_summary || format(': %s', _new_values->>'title');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    _change_summary := format('Updated %s', TG_TABLE_NAME);
    IF array_length(_changed_fields, 1) > 0 THEN
      _change_summary := _change_summary || format(': %s', array_to_string(_changed_fields, ', '));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    _change_summary := format('Deleted %s record', TG_TABLE_NAME);
    IF _old_values ? 'name' THEN
      _change_summary := _change_summary || format(': %s', _old_values->>'name');
    ELSIF _old_values ? 'email' THEN
      _change_summary := _change_summary || format(': %s', _old_values->>'email');
    END IF;
  END IF;
  
  -- Compute immutable hash for tamper detection
  _hash_input := COALESCE(_user_id::text, '') || 
                 COALESCE(_action_type::text, '') || 
                 COALESCE(TG_TABLE_NAME, '') || 
                 COALESCE(_record_id, '') ||
                 COALESCE(_old_values::text, '') ||
                 COALESCE(_new_values::text, '') ||
                 now()::text;
  _immutable_hash := encode(sha256(_hash_input::bytea), 'hex');
  
  -- Insert audit log entry
  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    user_role,
    action_type,
    table_name,
    record_id,
    property_id,
    request_origin,
    old_values,
    new_values,
    changed_fields,
    change_summary,
    is_sensitive,
    redacted_fields,
    immutable_hash
  ) VALUES (
    _user_id,
    _user_email,
    _user_role,
    _action_type,
    TG_TABLE_NAME,
    _record_id,
    _property_id,
    'db_trigger'::public.audit_request_origin,
    _old_values,
    _new_values,
    COALESCE(_changed_fields, '{}'),
    _change_summary,
    _is_sensitive,
    _redacted_fields,
    _immutable_hash
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 8. Create triggers on tracked tables

-- Properties (all operations)
CREATE TRIGGER audit_properties_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- Bookings (updates only - public creation excluded)
CREATE TRIGGER audit_bookings_changes
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- Profiles (all operations)
CREATE TRIGGER audit_profiles_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- User Roles (all operations - permission changes)
CREATE TRIGGER audit_user_roles_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- Journals (all operations)
CREATE TRIGGER audit_journals_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.journals
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- PMS Credentials (all operations - sensitive)
CREATE TRIGGER audit_pms_credentials_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.pms_credentials
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- PMS Mappings (all operations)
CREATE TRIGGER audit_pms_mappings_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.pms_mappings
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- API Keys (all operations - sensitive)
CREATE TRIGGER audit_api_keys_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- Access Requests (updates only - approval/rejection)
CREATE TRIGGER audit_access_requests_changes
  AFTER UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();