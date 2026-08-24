import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { subDays } from "date-fns";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RuSyncProgressTracker, type TrackerRun } from "@/components/integrations/RuSyncProgressTracker";

/**
 * Every Rentals United cron, its scheduled cadence and the health graded from the
 * last seven days of `ru_sync_runs`. This is the single home for RU pipeline health —
 * the Channel Monitor no longer carries the endpoint tracker.
 */
interface CronDef {
  fn: string;
  label: string;
  cadenceLabel: string;
  /** Expected gap between runs; null when event-driven. */
  intervalMs: number | null;
  /** `ru_sync_runs.action` values that evidence this cron. */
  actions: string[];
}

const HOUR = 60 * 60 * 1000;

const RU_CRONS: CronDef[] = [
  {
    fn: "cron-pull-ru-reservations",
    label: "Reservation pull",
    cadenceLabel: "Every 30 minutes",
    intervalMs: 30 * 60 * 1000,
    actions: ["ListReservations", "pull_reservations"],
  },
  {
    fn: "cron-refresh-ru-ari",
    label: "Availability & price refresh (ARI)",
    cadenceLabel: "Daily 02:20 UTC",
    intervalMs: 24 * HOUR,
    actions: ["refresh_ari", "PutAvbUnits", "PutPrices"],
  },
  {
    fn: "cron-refresh-ru-discounts",
    label: "Discount refresh",
    cadenceLabel: "Daily 04:00 UTC",
    intervalMs: 24 * HOUR,
    actions: ["refresh_discounts", "PutLongStayDiscounts"],
  },
  {
    fn: "cron-ru-rlnm-refresh",
    label: "RLNM handler refresh",
    cadenceLabel: "Daily 04:00 UTC",
    intervalMs: 24 * HOUR,
    actions: ["RLNM", "PutHandlerUrl"],
  },
  {
    fn: "cron-prune-ru-api-log",
    label: "Exchange log retention prune",
    cadenceLabel: "Daily 03:30 UTC",
    intervalMs: 24 * HOUR,
    actions: ["prune_api_log"],
  },
  {
    fn: "cron-push-all-properties-to-ru",
    label: "Weekly static content push",
    cadenceLabel: "Mondays 01:10 UTC",
    intervalMs: 7 * 24 * HOUR,
    actions: ["weekly_content_refresh", "PutProperty", "inventory_push"],
  },
  {
    fn: "cron-channel-reconcile",
    label: "Channel reconciliation",
    cadenceLabel: "Daily 03:10 UTC",
    intervalMs: 24 * HOUR,
    actions: ["reconcile", "channel_reconcile"],
  },
  {
    fn: "cron-channel-ledger-drain",
    label: "Channel ledger drain (local only)",
    cadenceLabel: "Every 5 minutes",
    intervalMs: 5 * 60 * 1000,
    actions: ["ledger_drain"],
  },
];

type Health = "healthy" | "overdue" | "error" | "idle";

const HEALTH_TONE: Record<Health, string> = {
  healthy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  overdue: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  idle: "border-border bg-muted text-muted-foreground",
};

const HEALTH_LABEL: Record<Health, string> = {
  healthy: "On cadence",
  overdue: "Overdue",
  error: "Last run failed",
  idle: "No runs recorded",
};

export default function DevRuSyncPipelines() {
  const [runs, setRuns] = useState<TrackerRun[]>([]);
  const [expectedProperties, setExpectedProperties] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = subDays(new Date(), 7).toISOString();
    const [runsRes, propsRes] = await Promise.all([
      supabase
        .from("ru_sync_runs")
        .select("created_at, action, property_id, success, error_message, ru_property_id, details")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("properties")
        .select("id")
        .eq("is_active", true)
        .eq("ru_push_enabled", true),
    ]);
    if (runsRes.error) toast.error(runsRes.error.message);
    else setRuns((runsRes.data ?? []) as TrackerRun[]);
    if (!propsRes.error) setExpectedProperties((propsRes.data ?? []).length);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cronRows = useMemo(
    () =>
      RU_CRONS.map((cron) => {
        const matching = runs.filter((r) => cron.actions.includes(r.action));
        const last = matching[0] ?? null;
        const failures = matching.filter((r) => !r.success).length;
        const age = last ? Date.now() - new Date(last.created_at).getTime() : null;

        let health: Health;
        if (last && !last.success) health = "error";
        else if (age === null) health = "idle";
        else if (cron.intervalMs !== null && age > cron.intervalMs * 1.25) health = "overdue";
        else health = "healthy";

        return { cron, last, runs7d: matching.length, failures, health };
      }),
    [runs],
  );

  return (
    <AppLayout>
      <div className="container mx-auto space-y-4 px-4 py-6">
        <PageHeader
          title="Rentals United — Sync Pipelines"
          subtitle="Every RU cron with its scheduled cadence, last run and health, plus the endpoint progress tracker."
          actions={
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/dev/system-health">
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  System Health
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Cron jobs &amp; refresh cadence</CardTitle>
            <CardDescription>Graded against each job's schedule using the last seven days of runs.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {cronRows.map(({ cron, last, runs7d, failures, health }) => (
                  <div key={cron.fn} className="flex items-start justify-between gap-3 rounded-lg border p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{cron.label}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{cron.fn}</p>
                      <p className="text-xs text-muted-foreground">
                        {cron.cadenceLabel} · last{" "}
                        {last ? formatDistanceToNow(new Date(last.created_at), { addSuffix: true }) : "never"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {runs7d} runs · {failures} failed (7 d)
                      </p>
                      {last && !last.success && last.error_message && (
                        <p className="mt-1 line-clamp-2 text-xs text-destructive">{last.error_message}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={HEALTH_TONE[health]}>
                      {HEALTH_LABEL[health]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <RuSyncProgressTracker runs={runs} expectedProperties={expectedProperties} />
      </div>
    </AppLayout>
  );
}
