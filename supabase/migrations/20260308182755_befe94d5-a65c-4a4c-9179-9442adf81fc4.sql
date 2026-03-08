
-- Add timezone column to properties
ALTER TABLE properties ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Johannesburg';

-- Create night audit log table
CREATE TABLE IF NOT EXISTS rolos_night_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  audit_date date NOT NULL,
  tasks_json jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  charges_posted integer DEFAULT 0,
  tax_posted numeric(12,2) DEFAULT 0,
  folios_closed integer DEFAULT 0,
  rooms_rolled integer DEFAULT 0,
  revenue_total numeric(12,2) DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id, audit_date)
);

-- Enable RLS
ALTER TABLE rolos_night_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies: property access via can_access_property
CREATE POLICY "night_audit_log_select" ON rolos_night_audit_log
  FOR SELECT TO authenticated
  USING (public.can_access_property(property_id, auth.uid()));

CREATE POLICY "night_audit_log_insert" ON rolos_night_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'dev') OR
    public.is_property_owner(property_id, auth.uid()) OR
    public.is_linked_owner(property_id, auth.uid())
  );

-- Service role can always insert (for cron)
CREATE POLICY "night_audit_log_service" ON rolos_night_audit_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
