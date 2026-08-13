import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ReconAccount {
  owner_id: string;
  owner_email: string | null;
  /** Live (non-archived) listings the account holds. */
  listing_count: number;
  error: string | null;
  /** True when this is the master/parent account, which may never hold listings. */
  is_master?: boolean;
}

export interface ReconArchived {
  listing_id: string;
  name: string;
  owner_id: string;
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

/** A surplus same-name copy of a listing on one channel account. */
export interface ReconDuplicate {
  listing_id: string;
  name: string;
  owner_id: string;
  /** The copy ROL'OS keeps — never removed. */
  keep_listing_id: string;
  copies: number;
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
  /** Live listings only — archived ones never bill and are reported apart. */
  channel_listing_count: number;
  archived_count: number;
  archived_orphans: ReconArchived[];
  matched: ReconMatched[];
  orphans: ReconOrphan[];
  stale: ReconStale[];
}

export interface CleanupProgress {
  done: number;
  total: number;
}

export interface CleanupOutcome {
  cleaned: number;
  total: number;
  /** Rows the channel account still returns after a removal request. */
  refused: number;
  failures: { key: string; label: string; reason: string }[];
}

/** What actually happened to one listing at the channel account. */
export type PurgeOutcome = "already_gone" | "deleted" | "refused";

/** Reads the JSON body an edge function returned alongside a non-2xx status. */
async function readFunctionError(fnError: unknown): Promise<string | null> {
  const ctx = (fnError as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.clone !== "function") return null;
  try {
    const body = (await ctx.clone().json()) as { detail?: string; error?: string };
    return body.detail || body.error || null;
  } catch {
    return null;
  }
}

/**
 * Pulls every listing the channel accounts actually hold and classifies it
 * against local records. Deliberately separate from `useChannelCostMonitor`:
 * that hook is an instant local read, this one talks to the channel manager and
 * only runs when an admin asks for it.
 *
 * Cleanup is verify → delete → verify: a listing is only treated as removed once
 * the account stops returning it, never on the strength of a success envelope.
 */
export function useChannelReconciliation() {
  const [result, setResult] = useState<ChannelReconciliation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState<CleanupProgress | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState<Record<string, string>>({});

  const reconcile = useCallback(async (opts?: { keepFailures?: boolean }) => {
    setRunning(true);
    setError(null);
    if (!opts?.keepFailures) {
      setFailures({});
      setRefused({});
    }
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
        archived_count: payload.archived_count || 0,
        archived_orphans: payload.archived_orphans || [],
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

  /**
   * Removes one listing id at the channel account. Throws only on a real
   * failure; a `refused` outcome (still present after the removal request) is
   * returned so the caller can keep the row visible and honestly labelled.
   */
  const purgeListing = useCallback(
    async (listing: { listing_id: string; owner_id: string; name?: string }): Promise<PurgeOutcome> => {
      const { data, error: fnError } = await supabase.functions.invoke("channel-manager-entitlement", {
        body: {
          scope: "purge_listing",
          entity_id: listing.listing_id,
          owner_id: listing.owner_id,
          reason: "Listing removed during channel reconciliation",
        },
      });

      if (fnError) {
        const detail = await readFunctionError(fnError);
        // 409 is the deliberate "channel refused the removal" answer.
        const status = (fnError as { context?: Response }).context?.status;
        if (status === 409) {
          const reason = detail || "The channel account still returns this listing";
          setRefused((prev) => ({ ...prev, [listing.listing_id]: reason }));
          return "refused";
        }
        throw new Error(detail || fnError.message);
      }

      const payload = (data || {}) as { success?: boolean; error?: string; outcome?: PurgeOutcome; detail?: string };
      if (payload.success === false || payload.outcome === "refused") {
        const reason = payload.detail || payload.error || "The channel account still returns this listing";
        setRefused((prev) => ({ ...prev, [listing.listing_id]: reason }));
        return "refused";
      }

      // Confirmed gone upstream, so the channel counter (and the account it
      // belonged to) must drop with it — otherwise the footer keeps reporting a
      // billing gap that no longer exists.
      setResult((prev) =>
        prev
          ? {
              ...prev,
              channel_listing_count: Math.max(0, prev.channel_listing_count - 1),
              accounts: prev.accounts.map((a) =>
                a.owner_id === listing.owner_id
                  ? { ...a, listing_count: Math.max(0, a.listing_count - 1) }
                  : a,
              ),
              orphans: prev.orphans.filter((o) => o.listing_id !== listing.listing_id),
              archived_orphans: prev.archived_orphans.filter((o) => o.listing_id !== listing.listing_id),
              archived_count:
                prev.archived_orphans.some((o) => o.listing_id === listing.listing_id)
                  ? Math.max(0, prev.archived_count - 1)
                  : prev.archived_count,
            }
          : prev,
      );
      return payload.outcome ?? "deleted";
    },
    [],
  );

  /** Kept for callers that still pass a full orphan row. */
  const purgeOrphan = useCallback(
    (orphan: ReconOrphan) => purgeListing(orphan),
    [purgeListing],
  );

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
   * Resolves the discrepancies the last pass found, one row at a time so a single
   * failure never aborts the rest. Matched (billable) listings are never touched.
   *
   * Default scope is "actionable": live orphans on the account plus stale local
   * ids. Archived listings cost nothing, so they are only deleted when the
   * caller explicitly asks for the "archived" scope.
   */
  const cleanupAll = useCallback(async (scope: "actionable" | "archived" = "actionable"): Promise<CleanupOutcome> => {
    const snapshot = result;
    if (!snapshot) return { cleaned: 0, total: 0, refused: 0, failures: [] };

    const erroredOwners = new Set(snapshot.accounts.filter((a) => a.error).map((a) => a.owner_id));
    const source = scope === "archived" ? snapshot.archived_orphans : snapshot.orphans;
    const listings: Array<{ listing_id: string; owner_id: string; name: string }> = source
      .filter((o) => !erroredOwners.has(o.owner_id))
      .map((o) => ({ listing_id: o.listing_id, owner_id: o.owner_id, name: o.name }));
    const stale = scope === "archived" ? [] : snapshot.stale;
    const total = listings.length + stale.length;


    const failed: CleanupOutcome["failures"] = [];
    const failMap: Record<string, string> = {};
    let done = 0;
    let cleaned = 0;
    let refusedCount = 0;
    setCleanup({ done: 0, total });

    for (const listing of listings) {
      try {
        const outcome = await purgeListing(listing);
        if (outcome === "refused") refusedCount++;
        else cleaned++;
      } catch (e) {
        const reason = e instanceof Error ? e.message : "Could not remove the listing";
        failed.push({ key: listing.listing_id, label: `${listing.name} #${listing.listing_id}`, reason });
        failMap[listing.listing_id] = reason;
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
    return { cleaned, total, refused: refusedCount, failures: failed };
  }, [result, purgeListing, clearStale, reconcile]);

  return {
    result,
    running,
    error,
    reconcile,
    purgeListing,
    purgeOrphan,
    clearStale,
    cleanupAll,
    cleanup,
    failures,
    refused,
  };
}
