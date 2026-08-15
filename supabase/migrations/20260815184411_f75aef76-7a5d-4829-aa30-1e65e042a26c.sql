CREATE TABLE public.channel_reconciliation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger TEXT NOT NULL DEFAULT 'cron',
  channel_listing_count INTEGER NOT NULL DEFAULT 0,
  local_billable_listings INTEGER NOT NULL DEFAULT 0,
  orphan_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  stale_count INTEGER NOT NULL DEFAULT 0,
  error_account_count INTEGER NOT NULL DEFAULT 0,
  has_disparity BOOLEAN NOT NULL DEFAULT false,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  alert_recipients TEXT[] NOT NULL DEFAULT '{}',
  alert_error TEXT,
  run_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.channel_reconciliation_runs TO authenticated;
GRANT ALL ON public.channel_reconciliation_runs TO service_role;

ALTER TABLE public.channel_reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view channel reconciliation runs"
ON public.channel_reconciliation_runs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'dev'::app_role)
  OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE INDEX idx_channel_reconciliation_runs_ran_at
ON public.channel_reconciliation_runs (ran_at DESC);