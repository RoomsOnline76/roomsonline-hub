import { useCallback, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, Trash2, Eraser, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useChannelReconciliation,
  type ReconArchivedMatched,
  type ReconOrphan,
  type ReconStale,
} from "@/hooks/useChannelReconciliation";
import { useChannelReconciliationRuns } from "@/hooks/useChannelReconciliationRuns";

interface Props {
  /** Listings ROL'OS currently bills for, so a channel/billing gap is visible. */
  billableListings: number;
  /** Reload the local monitor data after a purge or a cleared id. */
  onChanged: () => void | Promise<void>;
}

export function ChannelReconciliationPanel({ billableListings, onChanged }: Props) {
  const {
    result,
    running,
    error,
    reconcile,
    purgeListing,
    clearStale,
    repointListing,
    publishMissingUnits,
    restoreLocalUnit,
    clearConflict,
    cleanupAll,
    cleanup,
    failures,
    refused,
  } = useChannelReconciliation();
  const { latest: latestRun } = useChannelReconciliationRuns();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const erroredOwners = useMemo(
    // An account that was deferred or answered blank counts as un-read: nothing it
    // "did not return" may be treated as removable.
    () => new Set((result?.accounts || []).filter((a) => a.error || a.read === false).map((a) => a.owner_id)),
    [result],
  );

  // Surplus same-name copies of one unit. They bill like any other listing, so they are called
  // out separately from orphans — the keeper of each group is never in this list.
  const duplicateCleanable = useMemo(
    () => (result?.duplicates || []).filter((d) => !erroredOwners.has(d.owner_id)),
    [result, erroredOwners],
  );

  // Real discrepancies that still bill: live listings with no local match, plus
  // surplus duplicate copies. Archived listings are already off the portal and
  // carry no cost, so they are never part of a one-click cleanup.
  const cleanableListings = useMemo(() => {
    const orphans = (result?.orphans || []).filter((o) => !erroredOwners.has(o.owner_id));
    const seen = new Set(orphans.map((o) => o.listing_id));
    return [...orphans, ...duplicateCleanable.filter((d) => !seen.has(d.listing_id))];
  }, [result, erroredOwners, duplicateCleanable]);
  const readComplete = result?.read_complete !== false;
  const cleanableTotal = cleanableListings.length + (readComplete ? result?.stale.length || 0 : 0);
  const recoverableUnits = result?.recoverable_inactive_units || [];
  const reviewOnlyTotal = recoverableUnits.length + (result?.archived_matched.length || 0) +
    (result?.conflicts.length || 0);

  // Every live listing belongs to exactly one class, so the buckets must add up
  // to the live count the account returned. Any gap is a classification bug and
  // is shown rather than hidden.
  const matchedLiveListings = useMemo(
    () => new Set((result?.matched || []).map((m) => m.listing_id)).size,
    [result],
  );
  const liveBucketTotal =
    matchedLiveListings + (result?.duplicates.length || 0) + (result?.orphans.length || 0);





  const handlePurge = useCallback(
    async (listing: { listing_id: string; owner_id: string; name: string }) => {
      setBusyId(listing.listing_id);
      try {
        const outcome = await purgeListing(listing);
        if (outcome === "refused") {
          toast.error(`The channel account still returns listing #${listing.listing_id}`);
        } else if (outcome === "already_gone") {
          toast.success(`Listing #${listing.listing_id} was already gone — local id cleared`);
        } else {
          toast.success(`Listing #${listing.listing_id} confirmed removed from the channel`);
        }
        await onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove the listing");
      } finally {
        setBusyId(null);
      }
    },
    [purgeListing, onChanged],
  );

  const handleClear = useCallback(
    async (row: ReconStale) => {
      setBusyId(row.record_id);
      try {
        await clearStale(row);
        toast.success("Local id released — archived at the channel first");
        await onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not clear the local id");
      } finally {
        setBusyId(null);
      }
    },
    [clearStale, onChanged],
  );

  const handleRepoint = useCallback(
    async (row: ReconArchivedMatched) => {
      if (!row.live_alternative_id) return;
      setBusyId(row.record_id);
      try {
        await repointListing({
          record_id: row.record_id,
          kind: row.kind,
          owner_id: row.owner_id,
          listing_id: row.live_alternative_id,
        });
        toast.success(`${row.local_label} now points at live listing #${row.live_alternative_id}`);
        await onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not re-point the listing id");
      } finally {
        setBusyId(null);
      }
    },
    [repointListing, onChanged],
  );

  const handleClearConflict = useCallback(
    async (listingId: string, record: { record_id: string; kind: "property" | "unit"; label: string }) => {
      setBusyId(record.record_id);
      try {
        await clearConflict({ listing_id: listingId, record_id: record.record_id, kind: record.kind });
        toast.success(`Cleared listing #${listingId} from ${record.label}`);
        await onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not clear the local id");
      } finally {
        setBusyId(null);
      }
    },
    [clearConflict, onChanged],
  );

  const runCleanup = useCallback(
    async (scope: "actionable" | "archived" | "duplicates") => {
      setConfirmOpen(false);
      const outcome = await cleanupAll(scope);
      const problems = outcome.failures.length + outcome.refused;
      if (outcome.total === 0) {
        toast.success("Nothing to clean up — the account already matches");
      } else if (problems === 0) {
        toast.success(`Cleaned ${outcome.cleaned} of ${outcome.total}`);
      } else {
        toast.error(
          `Cleaned ${outcome.cleaned} of ${outcome.total} — ${outcome.refused} refused by the channel, ${outcome.failures.length} failed`,
        );
      }
      await onChanged();
    },
    [cleanupAll, onChanged],
  );

  const handleCleanupAll = useCallback(() => runCleanup("actionable"), [runCleanup]);
  const handleRemoveDuplicates = useCallback(() => runCleanup("duplicates"), [runCleanup]);



  /**
   * The only honest disparity is inside this read: every live listing must land in
   * exactly one bucket. Comparing the live count against the separately loaded
   * cost-monitor total produced phantom gaps whenever a listing was published
   * during the session, because that snapshot was older than the read.
   */
  const classificationGap = result ? Math.max(0, result.channel_listing_count - liveBucketTotal) : 0;
  const billingSnapshotGap = result ? result.channel_listing_count - billableListings : 0;

  // A reconcile changes what we know about the footprint, so the parent's cost
  // snapshot is refetched from the same moment as the read.
  const handleReconcile = useCallback(async () => {
    await reconcile();
    await onChanged();
  }, [reconcile, onChanged]);

  const cleaning = cleanup !== null;

  const handleRestore = useCallback(async (recordId: string, name: string) => {
    setBusyId(recordId);
    try {
      await restoreLocalUnit(recordId);
      toast.success(`${name} restored locally; its live listing was preserved`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not restore the unit");
    } finally {
      setBusyId(null);
    }
  }, [restoreLocalUnit, onChanged]);


  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Channel reconciliation</CardTitle>
          <CardDescription>
            Refresh above re-reads ROL'OS records only. This asks the channel accounts what they actually hold and
            compares it, so nothing bills unseen.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {result && (cleanableTotal > 0 || cleaning) && (
            <Button
              variant="default"
              size="sm"
              disabled={running || cleaning}
              onClick={() => setConfirmOpen(true)}
            >
              {cleaning ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Cleaning {cleanup?.done} / {cleanup?.total}…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Clean up all ({cleanableTotal})
                </>
              )}
            </Button>
          )}
          {result && cleanableTotal === 0 && reviewOnlyTotal === 0 && !cleaning && (
            <Badge variant="secondary" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Nothing to clean up
            </Badge>
          )}
          {result && cleanableTotal === 0 && reviewOnlyTotal > 0 && !cleaning && (
            <Badge variant="outline" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Review {reviewOnlyTotal} discrepanc{reviewOnlyTotal === 1 ? "y" : "ies"}
            </Badge>
          )}

          <Button variant="outline" size="sm" onClick={() => void reconcile()} disabled={running || cleaning}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
            Reconcile with channel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          {latestRun ? (
            <>
              Automatic nightly check ran {new Date(latestRun.ran_at).toLocaleString()} —{" "}
              {latestRun.run_error ? (
                <span className="text-destructive">failed: {latestRun.run_error}</span>
              ) : latestRun.has_disparity ? (
                <span className="text-destructive">
                  {latestRun.orphan_count} orphan, {latestRun.duplicate_count} duplicate,{" "}
                  {latestRun.stale_count} stale
                  {latestRun.error_account_count > 0 && `, ${latestRun.error_account_count} unverified account`}
                  {latestRun.alert_sent
                    ? " · warning emailed to ops"
                    : latestRun.alert_error
                      ? ` · alert email failed (${latestRun.alert_error})`
                      : ""}
                </span>
              ) : (
                <span>clean, no alert needed</span>
              )}
            </>
          ) : (
            "The automatic nightly check has not recorded a run yet."
          )}
        </p>

        {!result && !running && !error && (
          <p className="text-sm text-muted-foreground">
            Not reconciled yet in this session — run it to confirm the channel account matches these counts.
          </p>
        )}


        {result && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Live on the channel" value={result.channel_listing_count} />
              <Stat label="Matched locally" value={result.matched.length} />
              <Stat label="Orphans on channel" value={result.orphans.length} tone={result.orphans.length ? "warn" : undefined} />
              <Stat
                label="Duplicate copies"
                value={result.duplicates.length}
                tone={result.duplicates.length ? "warn" : undefined}
              />
              <Stat label="Archived — not billable" value={result.archived_count} />
              <Stat
                label="Linked to an archived listing"
                value={result.archived_matched.length}
                tone={result.archived_matched.length ? "warn" : undefined}
              />
              <Stat
                label="Conflicting local ids"
                value={result.conflicts.length}
                tone={result.conflicts.length ? "warn" : undefined}
              />
              <Stat
                label="Live but inactive locally"
                value={recoverableUnits.length}
                tone={recoverableUnits.length ? "warn" : undefined}
              />
              <Stat
                label="On other sub-accounts"
                value={result.foreign_listings.length}
                tone={result.foreign_listings.length ? "warn" : undefined}
              />


            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Reconciled {new Date(result.reconciled_at).toLocaleString()}</span>
              <span>
                {result.account_listing_total} listing{result.account_listing_total === 1 ? "" : "s"} held in total
                ({result.channel_listing_count} live + {result.archived_count} archived)
              </span>
              <span>{result.stale.length} stale local id{result.stale.length === 1 ? "" : "s"}</span>
              {!readComplete && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Incomplete read — {(result.unread_owner_ids || []).length || 1} account
                  {((result.unread_owner_ids || []).length || 1) === 1 ? "" : "s"} did not answer, no id can be
                  called stale
                </Badge>
              )}
              <span>
                Live breakdown: {matchedLiveListings} matched + {result.duplicates.length} duplicate cop
                {result.duplicates.length === 1 ? "y" : "ies"} + {result.orphans.length} orphan
                {result.orphans.length === 1 ? "" : "s"} = {liveBucketTotal} of {result.channel_listing_count} live
              </span>

              {classificationGap > 0 ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {classificationGap} live listing{classificationGap === 1 ? "" : "s"} could not be classified
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Billing count matches the account
                </Badge>
              )}
              {billingSnapshotGap !== 0 && (
                <span>
                  Local billing snapshot reads {billableListings} against {result.channel_listing_count} live —
                  refresh the page if this persists
                </span>
              )}

            </div>

            {result.roster_error && (
              <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                {result.roster_error}
              </p>
            )}

            {/* Single-account rule: ROL'OS listings live on the monitored sub-account only. */}
            {(result.owner_violations?.length ?? 0) > 0 && (
              <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive space-y-1">
                <p className="font-medium">Listings found outside the monitored account</p>
                {result.owner_violations!.map((v) => (
                  <p key={v.owner_id}>
                    {v.owner_label} holds {v.live_listing_count} live listing
                    {v.live_listing_count === 1 ? "" : "s"} — archive them, nothing may sell from this account.
                  </p>
                ))}
              </div>
            )}

            {(result.unverifiable_accounts?.length ?? 0) > 0 && (
              <div className="rounded-md border border-amber-500/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {result.unverifiable_accounts!.length} account
                  {result.unverifiable_accounts!.length === 1 ? "" : "s"} could not be read — cannot be proven empty
                </p>
                {result.unverifiable_accounts!.map((a) => (
                  <p key={a.owner_id}>
                    {a.owner_label} — {a.reason}
                  </p>
                ))}
              </div>
            )}

            {/* Detached sub-accounts: the master no longer lists them, so our keys can
                no longer read them. Excluded from every count, but kept visible — a
                non-zero (or unknown) last listing count is a billing question. */}
            {(result.detached_accounts?.length ?? 0) > 0 && (
              <details className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  {result.detached_accounts!.length} sub-account
                  {result.detached_accounts!.length === 1 ? "" : "s"} excluded — no longer under the master account
                </summary>
                <div className="mt-2 space-y-1">
                  {result.detached_accounts!.map((a) => (
                    <p key={a.owner_id}>
                      {a.owner_label}
                      {a.last_known_listing_count === null
                        ? " — last listing count unknown"
                        : ` — held ${a.last_known_listing_count} listing${a.last_known_listing_count === 1 ? "" : "s"} on the last recorded pass`}
                      {a.last_seen_at ? ` (${new Date(a.last_seen_at).toLocaleDateString()})` : ""}
                      {a.needs_billing_verification && (
                        <span className="ml-1 text-amber-600">
                          — confirm with the channel that this account and its listings moved off our master invoice.
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              </details>
            )}

            {/* Retired test sub-accounts: kept visible so the excluded rows are auditable,
                but deliberately collapsed — nothing here is read, counted or pushed to. */}
            {(result.retired_accounts?.length ?? 0) > 0 && (
              <details className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  {result.retired_accounts!.length} retired test sub-account
                  {result.retired_accounts!.length === 1 ? "" : "s"} excluded from all counts
                </summary>
                <div className="mt-2 space-y-1">
                  {result.retired_accounts!.map((a) => (
                    <p key={a.ru_owner_id}>
                      OwnerID {a.ru_owner_id}
                      {a.portal_email ? ` · ${a.portal_email}` : ""}
                      {a.reason ? ` — ${a.reason}` : ""}
                    </p>
                  ))}
                </div>
              </details>
            )}



            {/* What ROL'OS holds per property, so a unit missing a listing is visible. */}
            {(result.footprint?.length ?? 0) > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-medium">
                  Per-property footprint
                  {(result.untracked_unit_count ?? 0) > 0 && (
                    <span className="ml-2 text-xs font-normal text-destructive">
                      {result.untracked_unit_count} active unit
                      {result.untracked_unit_count === 1 ? "" : "s"} hold no channel listing
                    </span>
                  )}
                </h4>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Property</th>
                        <th className="px-3 py-2 text-right font-medium">Active units</th>
                        <th className="px-3 py-2 text-right font-medium">With listing</th>
                        <th className="px-3 py-2 text-right font-medium">Live on channel</th>
                        <th className="px-3 py-2 text-left font-medium">Gaps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.footprint!.map((f) => {
                        const gapUnits = f.units_without_listing;
                        const parked = f.inactive_units_with_listing;
                        return (
                          <tr key={f.property_id} className="border-t align-top">
                            <td className="px-3 py-2">
                              {f.property_name}
                              {f.building_listing_id && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  building {f.building_listing_id}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">{f.active_units}</td>
                            <td className="px-3 py-2 text-right">{f.units_with_listing}</td>
                            <td className="px-3 py-2 text-right">
                              {f.live_on_channel}
                              {f.archived_on_channel > 0 && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  (+{f.archived_on_channel} archived)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {gapUnits.length === 0 && parked.length === 0 ? (
                                <span className="text-muted-foreground">none</span>
                              ) : (
                                <div className="space-y-1">
                                  {gapUnits.length > 0 && (
                                    <div className="space-y-1">
                                      <p className="text-destructive">
                                        No listing yet: {gapUnits.map((u) => u.name).join(", ")} — publish to
                                        adopt or create.
                                      </p>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busyId === `publish:${f.property_id}`}
                                        onClick={async () => {
                                          setBusyId(`publish:${f.property_id}`);
                                          try {
                                            await publishMissingUnits({
                                              property_id: f.property_id,
                                              unit_ids: gapUnits.map((u) => u.record_id),
                                            });
                                            toast.success(`Published ${gapUnits.length} unit(s) for ${f.property_name}`);
                                            onChanged?.();
                                          } catch (e) {
                                            toast.error(
                                              e instanceof Error ? e.message : "Could not publish the missing units",
                                            );
                                          } finally {
                                            setBusyId(null);
                                          }
                                        }}
                                      >
                                        {busyId === `publish:${f.property_id}` ? (
                                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                        ) : (
                                          <Sparkles className="mr-1 h-3 w-3" />
                                        )}
                                        Publish missing units
                                      </Button>
                                    </div>
                                  )}

                                  {parked.length > 0 && (
                                    <div className="space-y-1">
                                      {parked.map((unit) => {
                                        const recoverable = recoverableUnits.some((u) => u.record_id === unit.record_id);
                                        return (
                                          <div key={unit.record_id} className="flex flex-wrap items-center gap-2">
                                            <span className="text-muted-foreground">
                                              {recoverable ? "Authored unit inactive locally" : "Inactive local unit"}: {unit.name} ({unit.listing_id})
                                            </span>
                                            {recoverable && (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={busyId !== null}
                                                onClick={() => void handleRestore(unit.record_id, unit.name)}
                                              >
                                                <RefreshCw className="mr-1 h-3 w-3" />
                                                Reactivate unit
                                              </Button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}


            {/* Which sub-account every number came from. Always visible: a report that
                names no account cannot be checked against the channel portal. */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium">Sub-accounts read</h4>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Sub-account</th>
                      <th className="px-3 py-2 text-right font-medium">Live</th>
                      <th className="px-3 py-2 text-right font-medium">Archived</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.accounts.map((a) => (
                      <tr key={a.owner_id}>
                        <td className="px-3 py-2">
                          <span className="block">{a.owner_label || a.owner_email || `OwnerID ${a.owner_id}`}</span>
                          <span className="text-xs text-muted-foreground">
                            {a.is_master ? "Master account" : a.bound ? "Bound in ROL'OS" : "Not bound in ROL'OS"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.error ? "—" : a.listing_count}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {a.error ? "—" : (a.archived_count ?? 0)}
                        </td>
                        <td className="px-3 py-2">
                          {a.error ? (
                            <span className="text-destructive">{a.error}</span>
                          ) : (
                            <span className="text-muted-foreground">Read</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.accounts.some((a) => !a.has_keys) && (
                <p className="text-xs text-muted-foreground">
                  Accounts without stored keys cannot be read. Capture their AccessKey and SecretKey in the
                  Channels wizard (Distribution account) to include them in this report.
                </p>
              )}
            </section>

            {result.foreign_listings.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-medium">
                  On another sub-account — {result.foreign_listings.length} listing
                  {result.foreign_listings.length === 1 ? "" : "s"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  These listings sit on sub-accounts ROL'OS has not bound. They are reported only — nothing here is
                  archived or deleted. Clean them up in the channel portal, or bind the account first.
                </p>
                <ul className="divide-y rounded-md border">
                  {result.foreign_listings.map((f) => (
                    <li
                      key={`${f.owner_id}:${f.listing_id}:${f.record_id ?? "none"}`}
                      className="px-3 py-2 text-sm"
                    >
                      <span className="block truncate">
                        {f.name}{" "}
                        <span className="text-muted-foreground">
                          #{f.listing_id}
                          {f.is_archived ? " · archived" : ""}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground">{f.owner_label}</span>
                      {f.local_label && (
                        <span className="block text-xs text-destructive">
                          A ROL'OS record points here: {f.local_label}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}


            {result.accounts.some((a) => a.is_master) && (
              <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                Listings were returned for the master channel account. White-label rules do not allow properties
                there — these must be archived and re-pushed under a linked sub-account.
              </p>
            )}

            {result.archived_orphans.length > 0 && (
              <section className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-sm font-medium"
                  onClick={() => setShowArchived((v) => !v)}
                >
                  <span>
                    Removed in the channel portal — {result.archived_orphans.length} listing
                    {result.archived_orphans.length === 1 ? "" : "s"}, not billable
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showArchived ? "rotate-180" : ""}`} />
                </button>
                <p className="text-xs text-muted-foreground">
                  Deleting a listing in the channel portal does not remove it from the channel's data feed — it stays
                  in the account flagged archived and unsellable. These are already in their terminal removed state:
                  they carry no cost, need no cleanup, and there is nothing further to delete.
                </p>

                {showArchived && (
                  <ul className="divide-y rounded-md border">
                    {result.archived_orphans.map((a) => (
                      <li key={a.listing_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {a.name} <span className="text-muted-foreground">#{a.listing_id}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">removed · archived in feed</span>
                      </li>
                    ))}
                  </ul>
                )}

              </section>
            )}

            {result.archived_matched.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-medium">
                  Local ids pointing at archived listings — {result.archived_matched.length}
                </h4>
                <p className="text-xs text-muted-foreground">
                  These records look connected, but the listing they point at is archived on the channel and cannot
                  sell. Where a re-push created a live copy of the same unit, re-point the record at it.
                </p>
                <ul className="divide-y rounded-md border">
                  {result.archived_matched.map((a) => (
                    <li
                      key={`${a.kind}:${a.record_id}:${a.listing_id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {a.local_label}{" "}
                        <span className="text-muted-foreground">
                          #{a.listing_id} · archived
                          {a.live_alternative_id ? ` · live copy #${a.live_alternative_id}` : " · no live copy found"}
                        </span>
                      </span>
                      {a.live_alternative_id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === a.record_id || cleaning}
                          onClick={() => void handleRepoint(a)}
                        >
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                          Re-point to the live listing
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === a.record_id || cleaning}
                          onClick={() =>
                            void handleClearConflict(a.listing_id, {
                              record_id: a.record_id,
                              kind: a.kind,
                              label: a.local_label,
                            })
                          }
                        >
                          <Eraser className="mr-1.5 h-3.5 w-3.5" />
                          Clear the id
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.conflicts.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-medium">
                  Conflicting local ids — {result.conflicts.length} listing
                  {result.conflicts.length === 1 ? "" : "s"} claimed by more than one record
                </h4>
                <p className="text-xs text-muted-foreground">
                  One channel listing cannot belong to several properties or units. Clear the id from every record
                  except the one that really owns it, then push that record again if it needs its own listing.
                </p>
                <ul className="divide-y rounded-md border">
                  {result.conflicts.map((c) => (
                    <li key={c.listing_id} className="space-y-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Listing #{c.listing_id}</span>
                      <ul className="space-y-1">
                        {c.records.map((r) => (
                          <li key={`${r.kind}:${r.record_id}`} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate">
                              {r.label}{" "}
                              <span className="text-muted-foreground">
                                {r.kind}
                                {r.local_active ? "" : " · inactive"}
                              </span>
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === r.record_id || cleaning}
                              onClick={() => void handleClearConflict(c.listing_id, r)}
                            >
                              <Eraser className="mr-1.5 h-3.5 w-3.5" />
                              Clear this id
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.duplicates.length > 0 && (
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">
                    Duplicate listings — {result.duplicates.length} surplus cop
                    {result.duplicates.length === 1 ? "y" : "ies"} of a unit already on the account
                  </h4>
                  {duplicateCleanable.length > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={running || cleaning}
                      onClick={() => void handleRemoveDuplicates()}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Remove duplicates ({duplicateCleanable.length})
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Same-name copies on one account. Each one bills like a real listing. The copy ROL'OS
                  syncs with is kept — only the surplus copies are removed.
                </p>
                <ul className="divide-y rounded-md border">
                  {result.duplicates.map((d) => (
                    <li key={d.listing_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {d.name}{" "}
                        <span className="text-muted-foreground">
                          #{d.listing_id} · {d.copies} copies · keeping #{d.keep_listing_id}
                        </span>
                        {(refused[d.listing_id] || failures[d.listing_id]) && (
                          <span className="block text-xs text-destructive">
                            {refused[d.listing_id] || failures[d.listing_id]}
                          </span>
                        )}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === d.listing_id || cleaning}
                        onClick={() => void handlePurge(d)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete from channel
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.orphans.length > 0 && (

              <section className="space-y-2">
                <h4 className="text-sm font-medium">Orphans on the channel — no local record points at these</h4>
                <ul className="divide-y rounded-md border">
                  {result.orphans.map((o) => (
                    <li key={o.listing_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {o.name}{" "}
                        <span className="text-muted-foreground">
                          #{o.listing_id}
                          {o.is_archived ? " · archived upstream" : ""}
                        </span>
                        {(refused[o.listing_id] || failures[o.listing_id]) && (
                          <span className="block text-xs text-destructive">
                            {refused[o.listing_id] || failures[o.listing_id]}
                          </span>
                        )}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === o.listing_id || cleaning}
                        onClick={() => void handlePurge(o)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete from channel
                      </Button>

                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(result.unverified?.length ?? 0) > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-medium">
                  Unverified local ids — the account was not read, so nothing may be cleared
                </h4>
                <p className="text-xs text-muted-foreground">
                  The channel rate-limited or answered blank on this pass. Reconcile again once the account
                  responds; these ids stay untouched until then.
                </p>
                <ul className="divide-y rounded-md border">
                  {result.unverified!.map((s) => (
                    <li key={s.record_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {s.label} <span className="text-muted-foreground">#{s.listing_id}</span>
                      </span>
                      <Badge variant="outline">Not verified</Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {result.stale.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-medium">Stale local ids — the account no longer returns these</h4>
                <ul className="divide-y rounded-md border">
                  {result.stale.map((s) => (
                    <li key={s.record_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {s.label} <span className="text-muted-foreground">#{s.listing_id}</span>
                        {failures[s.record_id] && (
                          <span className="block text-xs text-destructive">{failures[s.record_id]}</span>
                        )}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === s.record_id || cleaning}
                        onClick={() => void handleClear(s)}
                      >
                        <Eraser className="mr-1.5 h-3.5 w-3.5" />
                        Clear local id
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clean up {cleanableTotal} reconciliation item{cleanableTotal === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {cleanableListings.length} billable channel listing{cleanableListings.length === 1 ? "" : "s"} —
                  live listings with no local match plus surplus duplicate copies — will be archived upstream, then
                  re-read to confirm the account no longer sells them.
                </p>

                <p>
                  {result?.stale.length || 0} local listing id{(result?.stale.length || 0) === 1 ? "" : "s"} will be
                  released — each is verified at the channel and archived there first, never cleared blind.
                </p>

                <p>
                  Matched billable listings and archived listings are not touched. Every removal is logged for audit.
                </p>

                {erroredOwners.size > 0 && (
                  <p className="text-destructive">
                    {erroredOwners.size} account{erroredOwners.size === 1 ? "" : "s"} did not answer, so the picture is
                    incomplete — cleanup is limited to the accounts that did.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleCleanupAll()}>Clean up all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`rounded-md border p-3 ${tone === "warn" ? "border-destructive/50" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${tone === "warn" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}
