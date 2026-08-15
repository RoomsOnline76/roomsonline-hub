import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChannelReconciliationRun {
  id: string;
  ran_at: string;
  trigger: string;
  channel_listing_count: number;
  local_billable_listings: number;
  orphan_count: number;
  duplicate_count: number;
  stale_count: number;
  error_account_count: number;
  has_disparity: boolean;
  alert_sent: boolean;
  alert_error: string | null;
  run_error: string | null;
}

/** Latest automatic reconciliation run, so the panel can show when it last ran. */
export function useChannelReconciliationRuns() {
  const [latest, setLatest] = useState<ChannelReconciliationRun | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("channel_reconciliation_runs")
      .select(
        "id, ran_at, trigger, channel_listing_count, local_billable_listings, orphan_count, duplicate_count, stale_count, error_account_count, has_disparity, alert_sent, alert_error, run_error",
      )
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatest((data as ChannelReconciliationRun | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { latest, loading, reload: load };
}
