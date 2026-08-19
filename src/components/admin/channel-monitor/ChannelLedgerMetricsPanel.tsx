import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CHANNEL_CLASS_LEDGER_STEPS,
  LOCAL_CLASS_LEDGER_STEPS,
  type ChannelLedgerStatus,
} from "@/lib/channelStepLedger";

/**
 * Light channel-ledger observability (Phase 4).
 *
 * Counts only: how many steps sit in each status, split by local vs channel class, plus
 * the last few background drain runs. No guest data and no credentials are read here.
 */

const STATUS_ORDER: ChannelLedgerStatus[] = ["passed", "stale", "blocked", "unknown", "pending"];

/** Plain-language meaning of each ledger verdict, shown as a legend and on hover. */
const STATUS_HELP: Record<ChannelLedgerStatus, string> = {
  passed:
    "Graded and good. The wizard trusts this verdict and will not re-grade the step until something the step depends on changes.",
  stale:
    "It passed before, but data it depends on changed since (rates, rooms, images, company details). It needs a re-grade — local steps get one automatically on the next background drain, channel steps need “Recheck channel”.",
  blocked:
    "Graded and failed: something is genuinely missing or rejected, so go-live is held here until it is fixed.",
  unknown:
    "We tried to grade it but could not reach a verdict — usually a rate-limited or empty channel read. It is deliberately not treated as a failure; it is simply retried later.",
  pending:
    "A row exists but has never been graded yet. Seeding creates one row per step per property up front, so every step a property has not reached (or that no one has rechecked against the channel) sits here. High pending on channel steps is normal — those only grade when staff press “Recheck channel”.",
};


interface DrainRun {
  id: string;
  created_at: string;
  success: boolean;
  elapsed_ms: number | null;
  details: Record<string, unknown> | null;
}

function num(details: Record<string, unknown> | null, key: string): number {
  const value = details?.[key];
  return typeof value === "number" ? value : 0;
}

export function ChannelLedgerMetricsPanel() {
  const steps = useQuery({
    queryKey: ["channel-ledger-metrics-steps"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_channel_step_status")
        .select("step_key, status");
      if (error) throw error;
      return (data ?? []) as { step_key: string; status: ChannelLedgerStatus }[];
    },
  });

  const drains = useQuery({
    queryKey: ["channel-ledger-metrics-drains"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ru_sync_runs")
        .select("id, created_at, success, elapsed_ms, details")
        .eq("action", "ledger_drain")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as DrainRun[];
    },
  });

  const tally = useMemo(() => {
    const channelKeys = new Set<string>(CHANNEL_CLASS_LEDGER_STEPS);
    const localKeys = new Set<string>(LOCAL_CLASS_LEDGER_STEPS);
    const empty = () => STATUS_ORDER.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: 0 }), {});
    const local = empty();
    const channel = empty();
    for (const row of steps.data ?? []) {
      const bucket = channelKeys.has(row.step_key) ? channel : localKeys.has(row.step_key) ? local : null;
      if (!bucket) continue;
      bucket[row.status] = (bucket[row.status] ?? 0) + 1;
    }
    return { local, channel, rows: (steps.data ?? []).length };
  }, [steps.data]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Channel step ledger</CardTitle>
        <CardDescription>
          Durable step verdicts and the background drain that clears stale local steps without
          calling the channel. Refresh in the wizard is local; Recheck channel is the only
          staff action that talks to the Channel Manager.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : tally.rows === 0 ? (
          <p className="text-sm text-muted-foreground">No ledger rows yet — nothing has been seeded.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                [
                  "Local steps",
                  tally.local,
                  "Steps we can grade from our own database — property details, rooms, rates, images, policies. Graded on save and by the background drain, never by calling the Channel Manager.",
                ],
                [
                  "Channel steps",
                  tally.channel,
                  "Steps that can only be confirmed by reading the Channel Manager back — account keys, listing IDs, published units, availability and price coverage. These only grade when staff press “Recheck channel”, which is why most of them sit at pending.",
                ],
              ] as const).map(([label, counts, blurb]) => (
                <div key={label} className="rounded-md border p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {STATUS_ORDER.map((status) => (
                      <Badge
                        key={status}
                        variant={status === "passed" ? "secondary" : "outline"}
                        className="text-[11px] tabular-nums"
                        title={STATUS_HELP[status]}
                      >
                        {status} {counts[status] ?? 0}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                What each verdict means
              </p>
              <dl className="mt-2 space-y-2 text-xs">
                {STATUS_ORDER.map((status) => (
                  <div key={status} className="sm:flex sm:gap-2">
                    <dt className="min-w-[70px] font-medium capitalize">{status}</dt>
                    <dd className="text-muted-foreground">{STATUS_HELP[status]}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Counts are step rows, not properties: each property contributes one row per step, so a
                portfolio of 7 properties across 5 channel steps shows up to 35 channel rows.
              </p>
            </div>
          </>
        )}

        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Last background drains (local only, no channel calls)
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            The drain re-grades local steps that went stale and clears them, so the wizard opens on a
            fresh verdict without spending a channel call. “Rechecked” is properties visited,
            “cleared” is stale steps returned to passed, “blocked” is steps that genuinely failed, and
            “unknown” is steps it could not decide and will revisit.
          </p>
          {drains.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (drains.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The drain has not run yet, or the ledger flag is still off.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {(drains.data ?? []).map((run) => (

                <li key={run.id} className="flex flex-wrap items-center gap-2 rounded border px-2 py-1.5">
                  <span className="tabular-nums text-muted-foreground">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                  <Badge variant={run.success ? "secondary" : "destructive"} className="text-[10px]">
                    {run.success ? "clean" : "with failures"}
                  </Badge>
                  <span className="tabular-nums">
                    {num(run.details, "properties_rechecked")} rechecked ·{" "}
                    {num(run.details, "steps_cleared")} cleared ·{" "}
                    {num(run.details, "steps_blocked")} blocked ·{" "}
                    {num(run.details, "steps_unknown")} unknown
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
