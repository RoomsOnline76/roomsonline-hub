import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ReconAccount {
  owner_id: string;
  owner_email: string | null;
  listing_count: number;
  error: string | null;
}

export interface ReconMatched {
  listing_id: string;
  name: string;
  owner_id: string;
  is_archived: boolean;
  local_label: string;
  local_active: boolean;
  kind: "property" | "unit";
}

export interface ReconOrphan {
  listing_id: string;
  name: string;
  owner_id: string;
  is_archived: boolean;
}

export interface ReconStale {
  listing_id: string;
  label: string;
  kind: "property" | "unit";
  record_id: string;
  property_id: string;
  local_active: boolean;
}

export interface ChannelReconciliation {
  reconciled_at: string;
  accounts: ReconAccount[];
  channel_listing_count: number;
  matched: ReconMatched[];
  orphans: ReconOrphan[];
  stale: ReconStale[];
}

/**
 * Pulls every listing the channel accounts actually hold and classifies it
 * against local records. Deliberately separate from `useChannelCostMonitor`:
 * that hook is an instant local read, this one talks to the channel manager and
 * only runs when an admin asks for it.
 */
export function useChannelReconciliation() {
  const [result, setResult] = useState<ChannelReconciliation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reconcile = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("channel-manager-entitlement", {
        body: { scope: "reconcile", entity_id: "all" },
      });
      if (fnError) throw fnError;
      const payload = (data || {}) as { success?: boolean; error?: string } & ChannelReconciliation;
      if (payload.success === false) throw new Error(payload.error || "Reconciliation failed");
      setResult({
        reconciled_at: payload.reconciled_at,
        accounts: payload.accounts || [],
        channel_listing_count: payload.channel_listing_count || 0,
        matched: payload.matched || [],
        orphans: payload.orphans || [],
        stale: payload.stale || [],
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconciliation failed");
      return false;
    } finally {
      setRunning(false);
    }
  }, []);

  const purgeOrphan = useCallback(async (orphan: ReconOrphan) => {
    const { data, error: fnError } = await supabase.functions.invoke("channel-manager-entitlement", {
      body: {
        scope: "purge_listing",
        entity_id: orphan.listing_id,
        owner_id: orphan.owner_id,
        reason: "Orphan listing removed during channel reconciliation",
      },
    });
    if (fnError) throw fnError;
    const payload = (data || {}) as { success?: boolean; error?: string };
    if (payload.success === false) throw new Error(payload.error || "Could not remove the listing");
    setResult((prev) =>
      prev ? { ...prev, orphans: prev.orphans.filter((o) => o.listing_id !== orphan.listing_id) } : prev,
    );
  }, []);

  const clearStale = useCallback(async (row: ReconStale) => {
    const { data, error: fnError } = await supabase.functions.invoke("channel-manager-entitlement", {
      body: { scope: "clear_local_listing", entity_id: row.record_id, record_kind: row.kind },
    });
    if (fnError) throw fnError;
    const payload = (data || {}) as { success?: boolean; error?: string };
    if (payload.success === false) throw new Error(payload.error || "Could not clear the local id");
    setResult((prev) =>
      prev ? { ...prev, stale: prev.stale.filter((s) => s.record_id !== row.record_id) } : prev,
    );
  }, []);

  return { result, running, error, reconcile, purgeOrphan, clearStale };
}
