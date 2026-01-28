-- Phase 3: System Alerts table for AI-detected anomalies
CREATE TABLE public.system_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('rate_drift', 'sync_failure', 'conversion_drop', 'latency_spike', 'availability_issue', 'booking_anomaly', 'security', 'custom')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  component_key TEXT,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '7 days')
);

-- Enable RLS
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- Dev and admin can read all alerts
CREATE POLICY "Admins and devs can view all alerts"
ON public.system_alerts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'dev')
);

-- Dev and admin can manage alerts
CREATE POLICY "Admins and devs can manage alerts"
ON public.system_alerts
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'dev')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'dev')
);

-- Index for efficient queries
CREATE INDEX idx_system_alerts_unresolved ON public.system_alerts (is_resolved, severity, created_at DESC) WHERE is_resolved = false;
CREATE INDEX idx_system_alerts_component ON public.system_alerts (component_key) WHERE is_resolved = false;
CREATE INDEX idx_system_alerts_property ON public.system_alerts (property_id) WHERE property_id IS NOT NULL AND is_resolved = false;

-- Add comment
COMMENT ON TABLE public.system_alerts IS 'AI-detected system anomalies and alerts for proactive monitoring';