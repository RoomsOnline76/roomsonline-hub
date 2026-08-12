import { useCallback, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, Trash2, Eraser } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useChannelReconciliation, type ReconOrphan, type ReconStale } from "@/hooks/useChannelReconciliation";

interface Props {
  /** Listings ROL'OS currently bills for, so a channel/billing gap is visible. */
  billableListings: number;
  /** Reload the local monitor data after a purge or a cleared id. */
  onChanged: () => void | Promise<void>;
}

export function ChannelReconciliationPanel({ billableListings, onChanged }: Props) {
  const { result, running, error, reconcile, purgeOrphan, clearStale } = useChannelReconciliation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handlePurge = useCallback(
    async (orphan: ReconOrphan) => {
      setBusyId(orphan.listing_id);
      try {
        await purgeOrphan(orphan);
        toast.success(`Listing #${orphan.listing_id} removed from the channel`);
        await onChanged();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not remove the listing");
      } finally {
        setBusyId(null);
      }
    },
    [purgeOrphan, onChanged],
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

  const gap = result ? result.channel_listing_count - billableListings : 0;

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
        <Button variant="outline" size="sm" onClick={() => void reconcile()} disabled={running}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          Reconcile with channel
        </Button>
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
              <Stat label="On the channel" value={result.channel_listing_count} />
              <Stat label="Matched locally" value={result.matched.length} />
              <Stat label="Orphans on channel" value={result.orphans.length} tone={result.orphans.length ? "warn" : undefined} />
              <Stat label="Stale local ids" value={result.stale.length} tone={result.stale.length ? "warn" : undefined} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Reconciled {new Date(result.reconciled_at).toLocaleString()}</span>
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

            {result.orphans.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-medium">Orphans on the channel — no local record points at these</h4>
                <ul className="divide-y rounded-md border">
                  {result.orphans.map((o) => (
                    <li key={o.listing_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="truncate">
                        {o.name}{" "}
                        <span className="text-muted-foreground">
                          #{o.listing_id}
                          {o.is_archived ? " · archived upstream" : ""}
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === o.listing_id}
                        onClick={() => void handlePurge(o)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Remove from channel
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
                      <span className="truncate">
                        {s.label} <span className="text-muted-foreground">#{s.listing_id}</span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === s.record_id}
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
