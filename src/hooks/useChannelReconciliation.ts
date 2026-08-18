import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ReconAccount {
  owner_id: string;
  /** Portal login for the sub-account — the address used to sign in at the channel. */
  owner_email: string | null;
  login_email?: string | null;
  /** Contact address stored against the account, when it differs from the login. */
  contact_email?: string | null;
  /** Canonical one-line label: login · OwnerID (contact …). */
  owner_label?: string;
  /** True when ROL'OS has this sub-account bound to a portfolio/property. */
  bound?: boolean;
  /** True when an AccessKey + SecretKey are stored, so the account can be read. */
  has_keys?: boolean;
  /** Live (non-archived) listings the account holds. */
  listing_count: number;
  archived_count?: number;
  /** Every listing the account holds, live and archived. */
  total_listing_count?: number;
  /** The account really answered with its listing set on this pass. */
  read?: boolean;
  /** Not read because the channel rate-limited/queued the pull. */
  deferred?: boolean;
  error: string | null;
  /** True when this is the master/parent account, which may never hold listings. */
  is_master?: boolean;
}

/** A listing held by a sub-account ROL'OS has not bound — reported, never deleted. */
export interface ReconForeignListing {
  listing_id: string;
  name: string;
  owner_id: string;
  owner_label: string;
  is_archived: boolean;
  local_label: string | null;
  kind: "property" | "unit" | null;
  record_id: string | null;
  property_id: string | null;
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
  /** True when a local record points at this surplus copy (mis-wired id). */
  matched?: boolean;

}


/** A local id that points at a listing the channel has already archived. */
export interface ReconArchivedMatched {
  listing_id: string;
  name: string;
  owner_id: string;
  local_label: string;
  kind: "property" | "unit";
  record_id: string;
  property_id: string;
  local_active: boolean;
  /** The live same-name listing this record should point at, when one exists. */
  live_alternative_id: string | null;
}

/** One listing id claimed by more than one local record. */
export interface ReconConflict {
  listing_id: string;
  records: Array<{
    kind: "property" | "unit";
    record_id: string;
    property_id: string;
    label: string;
    local_active: boolean;
  }>;
}
/**
 * Per-property footprint: what ROL'OS holds versus what the channel returns, so an
 * active unit with no listing id (or a listing parked on an inactive unit) is visible.
 */
export interface ReconFootprint {
  property_id: string;
  property_name: string;
  push_enabled: boolean;
  building_listing_id: string | null;
  active_units: number;
  units_with_listing: number;
  units_without_listing: Array<{ record_id: string; name: string }>;
  inactive_units_with_listing: Array<{ record_id: string; name: string; listing_id: string }>;
  live_on_channel: number;
  archived_on_channel: number;
}

/** A sub-account holding live listings although it is not the monitored account. */
export interface ReconOwnerViolation {
  owner_id: string;
  owner_label: string;
  live_listing_count: number;
}

/** An account whose listings could not be read — cannot be proven empty. */
export interface ReconUnverifiableAccount {
  owner_id: string;
  owner_label: string;
  bound: boolean;
  has_keys: boolean;
  reason: string;
}


export interface ReconStale {
  listing_id: string;
  label: string;
  kind: "property" | "unit";
  record_id: string;
  property_id: string;
  local_active: boolean;
}

/** A test sub-account permanently retired: never read, counted, pushed to or alerted on. */
export interface ReconRetiredAccount {
  ru_owner_id: string;
  portal_email: string | null;
  reason: string | null;
  retired_at: string | null;
}

export interface ChannelReconciliation {
  reconciled_at: string;
  accounts: ReconAccount[];
  /** Live listings only — archived ones never bill and are reported apart. */
  channel_listing_count: number;
  archived_count: number;
  /** live + archived; must equal what the accounts hold. */
  account_listing_total: number;
  /** Every listing across every sub-account, bound or not. */
  all_account_listing_total?: number;
  foreign_listings: ReconForeignListing[];
  foreign_listing_count?: number;
  /** Set when the channel sub-account roster itself could not be read. */
  roster_error?: string | null;

  archived_orphans: ReconArchived[];
  archived_matched: ReconArchivedMatched[];
  conflicts: ReconConflict[];
  matched: ReconMatched[];
  orphans: ReconOrphan[];
  duplicates: ReconDuplicate[];
  stale: ReconStale[];
  /** Unseen local ids from an incomplete pass — reported, never cleanup targets. */
  unverified?: ReconStale[];
  /** Every account that could hold ROL'OS listings answered on this pass. */
  read_complete?: boolean;
  unread_owner_ids?: string[];
  footprint?: ReconFootprint[];
  untracked_unit_count?: number;
  inactive_units_holding_listings?: number;
  allowed_owner_ids?: string[];
  owner_violations?: ReconOwnerViolation[];
  unverifiable_accounts?: ReconUnverifiableAccount[];
  /** Retired test sub-accounts — excluded from every count above, shown for audit only. */
  retired_accounts?: ReconRetiredAccount[];


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
        account_listing_total:
          payload.account_listing_total ||
          (payload.channel_listing_count || 0) + (payload.archived_count || 0),
        all_account_listing_total: payload.all_account_listing_total,
        foreign_listings: payload.foreign_listings || [],
        foreign_listing_count: payload.foreign_listing_count ?? (payload.foreign_listings || []).length,
        roster_error: payload.roster_error ?? null,
        archived_orphans: payload.archived_orphans || [],

        archived_matched: payload.archived_matched || [],
        conflicts: payload.conflicts || [],
        matched: payload.matched || [],
        orphans: payload.orphans || [],
        duplicates: payload.duplicates || [],
        stale: payload.stale || [],
        unverified: payload.unverified || [],
        read_complete: payload.read_complete !== false,
        unread_owner_ids: payload.unread_owner_ids || [],
        // Footprint and owner-scope findings: dropping these here is what made the
        // per-property panel (and the unpublished-unit gap) invisible in the monitor.
        footprint: payload.footprint || [],
        untracked_unit_count: payload.untracked_unit_count ?? 0,
        inactive_units_holding_listings: payload.inactive_units_holding_listings ?? 0,
        allowed_owner_ids: payload.allowed_owner_ids || [],
        owner_violations: payload.owner_violations || [],
        unverifiable_accounts: payload.unverifiable_accounts || [],
        retired_accounts: payload.retired_accounts || [],

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

      const payload = (data || {}) as {
        success?: boolean;
        deferred?: boolean;
        error?: string;
        outcome?: PurgeOutcome;
        detail?: string;
      };
      // Rate-limit deferral: nothing was changed and nothing is refused — retry shortly.
      if (payload.deferred) {
        throw new Error(
          payload.error || "The channel is rate-limited right now — try this cleanup again in a minute.",
        );
      }
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
              duplicates: prev.duplicates.filter((d) => d.listing_id !== listing.listing_id),
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

  /** Points a local record at a listing verified live on the account. */
  const repointListing = useCallback(async (row: {
    record_id: string;
    kind: "property" | "unit";
    owner_id: string;
    listing_id: string;
  }) => {
    const { data, error: fnError } = await supabase.functions.invoke("channel-manager-entitlement", {
      body: {
        scope: "repoint_local_listing",
        entity_id: row.record_id,
        record_kind: row.kind,
        owner_id: row.owner_id,
        listing_id: row.listing_id,
        reason: "Local listing id re-pointed during channel reconciliation",
      },
    });
    if (fnError) throw new Error((await readFunctionError(fnError)) || fnError.message);
    const payload = (data || {}) as { success?: boolean; error?: string };
    if (payload.success === false) throw new Error(payload.error || "Could not re-point the listing id");
    setResult((prev) =>
      prev
        ? {
            ...prev,
            archived_matched: prev.archived_matched.filter((a) => a.record_id !== row.record_id),
            conflicts: prev.conflicts.filter((c) => c.listing_id !== row.listing_id),
          }
        : prev,
    );
  }, []);

  /**
   * Publishes the active units of a property that hold no channel listing yet.
   * Runs the normal push path scoped to those units, so adoption (live first,
   * then archived) still applies and no duplicate listing is minted.
   */
  const publishMissingUnits = useCallback(async (row: {
    property_id: string;
    unit_ids: string[];
  }) => {
    if (row.unit_ids.length === 0) return;
    const { data, error: fnError } = await supabase.functions.invoke("push-property-to-ru", {
      body: { property_id: row.property_id, only_unit_ids: row.unit_ids },
    });
    if (fnError) throw new Error((await readFunctionError(fnError)) || fnError.message);
    const payload = (data || {}) as { success?: boolean; status?: string; error?: { message?: string }; message?: string };
    if (payload.success === false && payload.status !== "resumable") {
      throw new Error(payload.error?.message || payload.message || "The channel push did not complete");
    }
    await reconcile({ keepFailures: true });
  }, [reconcile]);


  /** Releases a mis-wired id from one of the records claiming it. */
  const clearConflict = useCallback(async (row: {
    listing_id: string;
    record_id: string;
    kind: "property" | "unit";
  }) => {
    const { data, error: fnError } = await supabase.functions.invoke("channel-manager-entitlement", {
      body: { scope: "clear_local_listing", entity_id: row.record_id, record_kind: row.kind },
    });
    if (fnError) throw fnError;
    const payload = (data || {}) as { success?: boolean; error?: string };
    if (payload.success === false) throw new Error(payload.error || "Could not clear the local id");
    setResult((prev) =>
      prev
        ? {
            ...prev,
            conflicts: prev.conflicts
              .map((c) =>
                c.listing_id === row.listing_id
                  ? { ...c, records: c.records.filter((r) => r.record_id !== row.record_id) }
                  : c,
              )
              .filter((c) => c.records.length > 1),
            archived_matched: prev.archived_matched.filter((a) => a.record_id !== row.record_id),
          }
        : prev,
    );
  }, []);

  /**
   * Releases a local listing id. The backend always verifies the listing at the
   * channel and archives it first, so an id is never dropped locally while the
   * listing still sells and bills. A channel refusal keeps the row in the list.
   */
  const clearStale = useCallback(async (row: ReconStale) => {
    const { data, error: fnError } = await supabase.functions.invoke("channel-manager-entitlement", {
      body: {
        scope: "clear_local_listing",
        entity_id: row.record_id,
        record_kind: row.kind,
        reason: "Local listing id released during channel reconciliation",
      },
    });
    if (fnError) {
      const detail = await readFunctionError(fnError);
      const status = (fnError as { context?: Response }).context?.status;
      if (status === 409) {
        const reason = detail || "The channel account still returns this listing";
        setRefused((prev) => ({ ...prev, [row.record_id]: reason }));
        throw new Error(reason);
      }
      throw new Error(detail || fnError.message);
    }
    const payload = (data || {}) as { success?: boolean; deferred?: boolean; error?: string; detail?: string };
    if (payload.deferred) {
      throw new Error(
        payload.error || "The channel is rate-limited right now — try releasing this id again in a minute.",
      );
    }
    if (payload.success === false) {
      throw new Error(payload.detail || payload.error || "Could not release the local id");
    }
    setResult((prev) =>
      prev ? { ...prev, stale: prev.stale.filter((s) => s.record_id !== row.record_id) } : prev,
    );
  }, []);

  /**
   * Resolves the discrepancies the last pass found, one row at a time so a single
   * failure never aborts the rest. Matched (billable) listings are never touched.
   *
   * Default scope is "actionable": live orphans plus surplus same-name duplicate
   * copies (both bill) plus stale local ids. Archived listings cost nothing, so
   * they are only removed when the caller asks for the "archived" scope. The
   * "duplicates" scope removes surplus copies only and always keeps the keeper.
   */
  const cleanupAll = useCallback(async (
    scope: "actionable" | "archived" | "duplicates" = "actionable",
  ): Promise<CleanupOutcome> => {
    const snapshot = result;
    if (!snapshot) return { cleaned: 0, total: 0, refused: 0, failures: [] };

    // Only accounts that really answered on this pass may be acted on: a deferred or
    // blank read must never turn into a removal.
    const erroredOwners = new Set(
      snapshot.accounts.filter((a) => a.error || a.read === false).map((a) => a.owner_id),
    );
    const source: Array<{ listing_id: string; owner_id: string; name: string }> =
      scope === "archived" ? snapshot.archived_orphans
      : scope === "duplicates" ? snapshot.duplicates
      : [...snapshot.orphans, ...snapshot.duplicates];
    const seenListing = new Set<string>();
    const listings = source
      .filter((o) => !erroredOwners.has(o.owner_id))
      .filter((o) => (seenListing.has(o.listing_id) ? false : seenListing.add(o.listing_id) && true))
      .map((o) => ({ listing_id: o.listing_id, owner_id: o.owner_id, name: o.name }));
    // `stale` is only populated when every account answered; an incomplete pass puts
    // the unseen ids in `unverified`, which cleanup never touches.
    const stale = scope === "actionable" && snapshot.read_complete !== false ? snapshot.stale : [];
    const total = listings.length + stale.length;

    const failed: CleanupOutcome["failures"] = [];
    const failMap: Record<string, string> = {};
    const refusedMap: Record<string, string> = {};
    let done = 0;
    let cleaned = 0;
    let refusedCount = 0;
    setCleanup({ done: 0, total });

    // One batch per channel account: the backend reads the account once, removes
    // every target against that snapshot, then verifies once. Per-row calls each
    // cost two full account reads (and their rate-limit waits), which is what made
    // cleanup take minutes per listing.
    type BatchTarget = {
      type: "listing" | "stale";
      listing_id?: string | null;
      record_id?: string | null;
      record_kind?: "property" | "unit";
      property_id?: string | null;
      name?: string;
    };
    const byOwner = new Map<string, BatchTarget[]>();
    for (const l of listings) {
      const list = byOwner.get(l.owner_id) ?? [];
      list.push({ type: "listing", listing_id: l.listing_id, name: l.name });
      byOwner.set(l.owner_id, list);
    }
    // Stale rows carry no owner id; the backend scopes each one to its own
    // account and reports `skipped` when it belongs elsewhere, so offering them
    // to every account resolves them exactly once.
    const staleTargets: BatchTarget[] = stale.map((s) => ({
      type: "stale",
      record_id: s.record_id,
      record_kind: s.kind,
      property_id: s.property_id,
      listing_id: s.listing_id,
      name: `${s.label} #${s.listing_id}`,
    }));
    const owners = byOwner.size > 0
      ? Array.from(byOwner.keys())
      : snapshot.accounts.filter((a) => !a.error && a.read !== false).map((a) => a.owner_id);
    if (staleTargets.length > 0) {
      for (const owner of owners) {
        byOwner.set(owner, [...(byOwner.get(owner) ?? []), ...staleTargets]);
      }
    }

    const resolvedStale = new Set<string>();

    for (const [owner, ownerTargets] of byOwner.entries()) {
      let queue = ownerTargets.filter(
        (t) => !(t.type === "stale" && t.record_id && resolvedStale.has(t.record_id)),
      );
      let guard = 0;
      while (queue.length > 0 && guard++ < 20) {
        const { data, error: fnError } = await supabase.functions.invoke("channel-manager-entitlement", {
          body: {
            scope: "cleanup_batch",
            entity_id: "batch",
            owner_id: owner,
            targets: queue,
            reason: "Listing removed during channel reconciliation",
          },
        });
        if (fnError) {
          const reason = (await readFunctionError(fnError)) || fnError.message;
          for (const t of queue) {
            const key = t.type === "stale" ? String(t.record_id) : String(t.listing_id);
            failed.push({ key, label: t.name || key, reason });
            failMap[key] = reason;
            done++;
          }
          setCleanup({ done, total });
          queue = [];
          break;
        }
        const payload = (data || {}) as {
          deferred?: boolean;
          error?: string;
          status?: string;
          results?: Array<{ key: string; label: string; outcome: string; detail: string }>;
          remaining?: BatchTarget[];
        };
        if (payload.deferred) {
          const reason =
            payload.error || "The channel is rate-limited right now — try the cleanup again in a minute.";
          for (const t of queue) {
            const key = t.type === "stale" ? String(t.record_id) : String(t.listing_id);
            failed.push({ key, label: t.name || key, reason });
            failMap[key] = reason;
            done++;
          }
          setCleanup({ done, total });
          queue = [];
          break;
        }

        for (const r of payload.results || []) {
          if (r.outcome === "skipped") continue;
          if (r.outcome === "deleted" || r.outcome === "already_gone" || r.outcome === "no_listing_id") {
            cleaned++;
            resolvedStale.add(r.key);
          } else if (r.outcome === "refused") {
            refusedCount++;
            refusedMap[r.key] = r.detail;
            resolvedStale.add(r.key);
          } else {
            failed.push({ key: r.key, label: r.label, reason: r.detail });
            failMap[r.key] = r.detail;
            resolvedStale.add(r.key);
          }
          done++;
        }
        setCleanup({ done, total });
        queue = (payload.remaining || []).filter(
          (t) => !(t.type === "stale" && t.record_id && resolvedStale.has(t.record_id)),
        );
      }
    }

    setFailures(failMap);
    setRefused((prev) => ({ ...prev, ...refusedMap }));
    setCleanup(null);

    // Re-read the channel so every counter (and the billing-gap footer) reflects
    // the post-cleanup truth rather than our optimistic local decrements.
    if (cleaned > 0) await reconcile({ keepFailures: true });
    return { cleaned, total, refused: refusedCount, failures: failed };
  }, [result, reconcile]);

  return {
    result,
    running,
    error,
    reconcile,
    purgeListing,
    purgeOrphan,
    clearStale,
    repointListing,
    publishMissingUnits,
    clearConflict,
    cleanupAll,
    cleanup,
    failures,
    refused,
  };
}
