-- Fix the log_audit_change function to properly handle SHA256 hash input
CREATE OR REPLACE FUNCTION public.log_audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  
  -- Compute immutable hash for tamper detection (fix: convert_to for proper bytea)
  _hash_input := COALESCE(_user_id::text, '') || 
                 COALESCE(_action_type::text, '') || 
                 COALESCE(TG_TABLE_NAME, '') || 
                 COALESCE(_record_id, '') ||
                 COALESCE(_old_values::text, '') ||
                 COALESCE(_new_values::text, '') ||
                 now()::text;
  _immutable_hash := encode(sha256(convert_to(_hash_input, 'UTF8')), 'hex');
  
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
$function$;