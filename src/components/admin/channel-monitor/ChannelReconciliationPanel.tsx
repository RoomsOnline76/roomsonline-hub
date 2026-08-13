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
import { useChannelReconciliation, type ReconOrphan, type ReconStale } from "@/hooks/useChannelReconciliation";

interface Props {
  /** Listings ROL'OS currently bills for, so a channel/billing gap is visible. */
  billableListings: number;
  /** Reload the local monitor data after a purge or a cleared id. */
  onChanged: () => void | Promise<void>;
}

export function ChannelReconciliationPanel({ billableListings, onChanged }: Props) {
  const { result, running, error, reconcile, purgeListing, clearStale, cleanupAll, cleanup, failures, refused } =
    useChannelReconciliation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const erroredOwners = useMemo(
    () => new Set((result?.accounts || []).filter((a) => a.error).map((a) => a.owner_id)),
    [result],
  );

  // Only real discrepancies are cleanable: live listings on the account with no
  // local match, plus stale local ids. Archived listings are already gone from
  // the portal and carry no cost, so a matched account has nothing to clean up.
  const cleanableListings = useMemo(
    () => (result?.orphans || []).filter((o) => !erroredOwners.has(o.owner_id)),
    [result, erroredOwners],
  );
  const cleanableTotal = cleanableListings.length + (result?.stale.length || 0);
  const archivedCleanable = useMemo(
    () => (result?.archived_orphans || []).filter((a) => !erroredOwners.has(a.owner_id)),
    [result, erroredOwners],
  );
  // Surplus same-name copies of one unit. They bill like any other listing, so they are called
  // out separately from orphans — the keeper of each group is never in this list.
  const duplicateCleanable = useMemo(
    () => (result?.duplicates || []).filter((d) => !erroredOwners.has(d.owner_id)),
    [result, erroredOwners],
  );



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
        toast.success("Local listing id cleared");
        await onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not clear the local id");
      } finally {
        setBusyId(null);
      }
    },
    [clearStale, onChanged],
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
  const handleDeleteArchived = useCallback(() => runCleanup("archived"), [runCleanup]);
  const handleRemoveDuplicates = useCallback(() => runCleanup("duplicates"), [runCleanup]);



  const gap = result ? result.channel_listing_count - billableListings : 0;
  const cleaning = cleanup !== null;


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
          {result && cleanableTotal === 0 && !cleaning && (
            <Badge variant="secondary" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Nothing to clean up
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
              <Stat label="Archived — not billable" value={result.archived_count} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Reconciled {new Date(result.reconciled_at).toLocaleString()}</span>
              <span>{result.stale.length} stale local id{result.stale.length === 1 ? "" : "s"}</span>
              {gap > 0 ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {gap} more listing{gap === 1 ? "" : "s"} on the account than we bill for
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Billing count matches the account
                </Badge>
              )}
            </div>

            {result.accounts.some((a) => a.error) && (
              <div className="space-y-1 rounded-md border border-destructive/40 p-3 text-sm">
                {result.accounts
                  .filter((a) => a.error)
                  .map((a) => (
                    <p key={a.owner_id} className="text-destructive">
                      Account {a.owner_email || a.owner_id}: {a.error}
                    </p>
                  ))}
              </div>
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
                    Archived on the channel — {result.archived_orphans.length} listing
                    {result.archived_orphans.length === 1 ? "" : "s"}, not billable
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showArchived ? "rotate-180" : ""}`} />
                </button>
                <p className="text-xs text-muted-foreground">
                  The channel keeps archived listings in its data feed and only hides them in its own portal. They
                  carry no cost and are not part of a cleanup — delete them only if you want the feed tidy.
                </p>
                {showArchived && archivedCleanable.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={running || cleaning}
                    onClick={() => void handleDeleteArchived()}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete archived ({archivedCleanable.length})
                  </Button>
                )}

                {showArchived && (
                  <ul className="divide-y rounded-md border">
                    {result.archived_orphans.map((a) => (
                      <li key={a.listing_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {a.name} <span className="text-muted-foreground">#{a.listing_id} · archived</span>
                          {(refused[a.listing_id] || failures[a.listing_id]) && (
                            <span className="block text-xs text-destructive">
                              {refused[a.listing_id] || failures[a.listing_id]}
                            </span>
                          )}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === a.listing_id || cleaning}
                          onClick={() => void handlePurge(a)}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete from channel
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
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
                  {cleanableListings.length} live channel listing{cleanableListings.length === 1 ? "" : "s"} with no
                  local match will be deleted upstream, then re-read to confirm the account no longer returns them.
                </p>

                <p>
                  {result?.stale.length || 0} stale local id{(result?.stale.length || 0) === 1 ? "" : "s"} will be
                  cleared — no channel call needed.
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
