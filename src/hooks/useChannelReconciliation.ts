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
export interface CleanupProgress {
  done: number;
  total: number;
}

export interface CleanupOutcome {
  cleaned: number;
  total: number;
  failures: { key: string; label: string; reason: string }[];
}

export function useChannelReconciliation() {
  const [result, setResult] = useState<ChannelReconciliation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState<CleanupProgress | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});

  const reconcile = useCallback(async (opts?: { keepFailures?: boolean }) => {
    setRunning(true);
    setError(null);
    if (!opts?.keepFailures) setFailures({});
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
    // The listing is gone upstream, so the channel counter (and the account it
    // belonged to) must drop with it — otherwise the footer keeps reporting a
    // billing gap that no longer exists.
    setResult((prev) =>
      prev
        ? {
            ...prev,
            channel_listing_count: Math.max(0, prev.channel_listing_count - 1),
            accounts: prev.accounts.map((a) =>
              a.owner_id === orphan.owner_id
                ? { ...a, listing_count: Math.max(0, a.listing_count - 1) }
                : a,
            ),
            orphans: prev.orphans.filter((o) => o.listing_id !== orphan.listing_id),
          }
        : prev,
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

  /**
   * Resolves everything the last pass classified as orphan or stale, one row at
   * a time so a single failure never aborts the rest. Matched (billable)
   * listings are never touched.
   */
  const cleanupAll = useCallback(async (): Promise<CleanupOutcome> => {
    const snapshot = result;
    if (!snapshot) return { cleaned: 0, total: 0, failures: [] };

    const erroredOwners = new Set(snapshot.accounts.filter((a) => a.error).map((a) => a.owner_id));
    const orphans = snapshot.orphans.filter((o) => !erroredOwners.has(o.owner_id));
    const stale = snapshot.stale;
    const total = orphans.length + stale.length;

    const failed: CleanupOutcome["failures"] = [];
    const failMap: Record<string, string> = {};
    let done = 0;
    let cleaned = 0;
    setCleanup({ done: 0, total });

    for (const o of orphans) {
      try {
        await purgeOrphan(o);
        cleaned++;
      } catch (e) {
        const reason = e instanceof Error ? e.message : "Could not remove the listing";
        failed.push({ key: o.listing_id, label: `${o.name} #${o.listing_id}`, reason });
        failMap[o.listing_id] = reason;
      }
      done++;
      setCleanup({ done, total });
    }

    for (const s of stale) {
      try {
        await clearStale(s);
        cleaned++;
      } catch (e) {
        const reason = e instanceof Error ? e.message : "Could not clear the local id";
        failed.push({ key: s.record_id, label: `${s.label} #${s.listing_id}`, reason });
        failMap[s.record_id] = reason;
      }
      done++;
      setCleanup({ done, total });
    }

    setFailures(failMap);
    setCleanup(null);
    // Re-read the channel so every counter (and the billing-gap footer) reflects
    // the post-cleanup truth rather than our optimistic local decrements.
    if (cleaned > 0) await reconcile({ keepFailures: true });
    return { cleaned, total, failures: failed };
  }, [result, purgeOrphan, clearStale, reconcile]);

  return { result, running, error, reconcile, purgeOrphan, clearStale, cleanupAll, cleanup, failures };
}
