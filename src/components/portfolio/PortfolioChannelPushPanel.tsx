import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { pushPropertiesToChannel, type RuPortfolioPushRow } from "@/lib/ruPortfolioPush";

interface PushableProperty {
  id: string;
  name: string;
  ru_archived?: boolean | null;
}

interface PortfolioChannelPushPanelProps {
  /** Properties linked to this distribution account. */
  properties: PushableProperty[];
  /** Account OwnerID — the push is refused upstream without one, so the control stays disabled. */
  ownerId: string | null;
  keysCaptured: boolean;
  onDone?: () => void;
}

const STATE_LABEL: Record<RuPortfolioPushRow["state"], string> = {
  queued: "Queued",
  running: "Pushing…",
  pushed: "Pushed",
  skipped: "Not ready",
  failed: "Failed",
};

/**
 * One-click push of every property sharing a distribution account. The account's OwnerID and API
 * keys are inherited by all of its properties, so nothing has to be re-entered per property — this
 * only walks them one at a time and reports the outcome of each.
 */
export function PortfolioChannelPushPanel({
  properties,
  ownerId,
  keysCaptured,
  onDone,
}: PortfolioChannelPushPanelProps) {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<RuPortfolioPushRow[]>([]);

  const targets = useMemo(
    () => properties.filter((p) => !p.ru_archived).map((p) => ({ id: p.id, name: p.name })),
    [properties],
  );

  const run = useCallback(async () => {
    setRunning(true);
    setRows([]);
    try {
      const result = await pushPropertiesToChannel(targets, setRows);
      const pushed = result.filter((r) => r.state === "pushed").length;
      const skipped = result.filter((r) => r.state === "skipped").length;
      const failed = result.filter((r) => r.state === "failed").length;
      if (failed > 0) {
        toast.error(`${pushed} pushed, ${skipped} not ready, ${failed} failed`);
      } else if (skipped > 0) {
        toast.warning(`${pushed} pushed, ${skipped} not ready yet`);
      } else {
        toast.success(`${pushed} propert${pushed === 1 ? "y" : "ies"} pushed to the channel`);
      }
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Portfolio push failed");
    } finally {
      setRunning(false);
    }
  }, [targets, onDone]);

  if (targets.length === 0) return null;

  const blocked = !ownerId || !keysCaptured;

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">Push all properties on this account</p>
          <p className="text-[10px] text-muted-foreground">
            {blocked
              ? "Needs an account id and verified API keys before anything can be pushed."
              : `All ${targets.length} propert${targets.length === 1 ? "y" : "ies"} inherit this account's id and keys. They are pushed one at a time to respect channel rate limits.`}
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={running || blocked} onClick={() => void run()}>
          {running ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
          )}
          Push {targets.length} to channel
        </Button>
      </div>

      {rows.length > 0 && (
        <ul className="divide-y rounded-md border">
          {rows.map((r) => (
            <li key={r.propertyId} className="px-2.5 py-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{r.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.total > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {r.pushed}/{r.total} units
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={
                      r.state === "pushed"
                        ? "text-[9px] text-success border-success/40"
                        : r.state === "failed"
                          ? "text-[9px] text-destructive border-destructive/40"
                          : "text-[9px] text-muted-foreground"
                    }
                  >
                    {STATE_LABEL[r.state]}
                  </Badge>
                </span>
              </div>
              {r.blockers.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-[10px] text-muted-foreground">
                  {r.blockers.slice(0, 4).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
              {r.message && r.blockers.length === 0 && (
                <p className="mt-0.5 text-[10px] text-destructive">{r.message}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
