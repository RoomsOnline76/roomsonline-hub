CREATE OR REPLACE FUNCTION public.search_audit_logs(
  search_text text DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL,
  source_filter text DEFAULT NULL,
  result_limit integer DEFAULT 50,
  result_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  user_id uuid,
  user_email text,
  user_role text,
  action_type text,
  table_name text,
  record_id text,
  property_id uuid,
  change_summary text,
  changed_fields text[],
  is_sensitive boolean,
  old_values jsonb,
  new_values jsonb,
  request_origin text,
  correlation_id text,
  edge_function_name text,
  ip_address text,
  user_agent text,
  metadata jsonb,
  immutable_hash text,
  redacted_fields text[],
  session_id text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT a.*,
      COUNT(*) OVER() AS total_count
    FROM audit_logs a
    WHERE
      (date_from IS NULL OR a.created_at >= date_from)
      AND (date_to IS NULL OR a.created_at <= date_to)
      AND (source_filter IS NULL OR a.table_name = source_filter)
      AND (search_text IS NULL OR (
        a.change_summary ILIKE '%' || search_text || '%'
        OR a.user_email ILIKE '%' || search_text || '%'
        OR a.record_id ILIKE '%' || search_text || '%'
        OR a.table_name ILIKE '%' || search_text || '%'
        OR a.correlation_id ILIKE '%' || search_text || '%'
        OR CAST(a.old_values AS text) ILIKE '%' || search_text || '%'
        OR CAST(a.new_values AS text) ILIKE '%' || search_text || '%'
        OR CAST(a.metadata AS text) ILIKE '%' || search_text || '%'
      ))
    ORDER BY a.created_at DESC
    LIMIT result_limit
    OFFSET result_offset
  )
  SELECT
    f.id, f.created_at, f.user_id, f.user_email,
    f.user_role::text, f.action_type::text, f.table_name, f.record_id,
    f.property_id, f.change_summary, f.changed_fields, f.is_sensitive,
    f.old_values, f.new_values, f.request_origin::text, f.correlation_id,
    f.edge_function_name, f.ip_address, f.user_agent, f.metadata,
    f.immutable_hash, f.redacted_fields, f.session_id,
    f.total_count
  FROM filtered f;
$$;