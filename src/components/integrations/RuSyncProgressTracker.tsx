import { useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowUpFromLine,
  ArrowDownToLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CircleDashed,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  KeyRound,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface TrackerRun {
  created_at: string;
  action: string;
  property_id: string | null;
  success: boolean;
  error_message?: string | null;
  ru_property_id?: string | number | null;
  details?: unknown;
}

type Direction = "push" | "pull";

interface EndpointDef {
  /** RU API method name. */
  method: string;
  label: string;
  direction: Direction;
  /** `ru_sync_runs.action` values that evidence this endpoint. */
  actions: string[];
  /** Edge function that exercises it, when a manual run is possible. */
  fn?: string;
  scoped: boolean;
  /**
   * When set, per-unit outcomes inside `details.units[]` are counted as
   * individual calls using this boolean field (falling back to `success`).
   */
  unitField?: "availability_pushed" | "prices_pushed" | "success";
  note?: string;
}

/** Every RU endpoint in the global implementation, in execution order. */
const ENDPOINTS: EndpointDef[] = [
  {
    method: "Push_PutProperty_RQ",
    label: "Property content",
    direction: "push",
    actions: ["weekly_content_refresh", "PutProperty", "inventory_push"],
    fn: "cron-push-all-properties-to-ru",
    scoped: true,
    unitField: "success",
  },
  {
    method: "Push_PutAvbUnits_RQ",
    label: "Availability (units)",
    direction: "push",
    actions: ["refresh_ari", "PutAvbUnits"],
    fn: "cron-refresh-ru-ari",
    scoped: true,
    unitField: "availability_pushed",
  },
  {
    method: "Push_PutLongStayPrices_RQ",
    label: "Prices",
    direction: "push",
    actions: ["refresh_ari", "PutPrices"],
    fn: "cron-refresh-ru-ari",
    scoped: true,
    unitField: "prices_pushed",
    note: "Pushed together with availability in the ARI refresh.",
  },
  {
    method: "Push_PutHandlerUrl_RQ",
    label: "RLNM handler subscription",
    direction: "push",
    actions: ["PutHandlerUrl", "RLNM"],
    fn: "cron-ru-rlnm-refresh",
    scoped: false,
    note: "Must be refreshed at least every 24 hours.",
  },
  {
    method: "Pull_ListReservations_RQ",
    label: "Reservations",
    direction: "pull",
    actions: ["pull_reservations", "ListReservations"],
    fn: "cron-pull-ru-reservations",
    scoped: false,
    note: "Account-wide poll; rate limited to one call per sliding minute.",
  },
];

interface Props {
  runs: TrackerRun[];
  /** Manual scope; empty/omitted means every RU-enabled property. */
  scopeIds?: string[];
  /** Number of properties currently expected to sync. */
  expectedProperties: number;
  /** Manual triggering is optional: read-only surfaces omit it. */
  triggering?: string | null;
  onTrigger?: (fn: string, label: string, scoped: boolean) => void;
}

interface Call {
  at: string;
  success: boolean;
  unit: string | null;
  error: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Per-endpoint progress and health for the whole RU implementation (push and pull).
 *
 * Grading deliberately leans on *current* health — the outcome of the latest run
 * plus the last 24 hours — so historic failures from a since-fixed implementation
 * cannot hold an endpoint red. The 7-day rate is kept as context only.
 */
export function RuSyncProgressTracker({
  runs,
  scopeIds = [],
  expectedProperties,
  triggering = null,
  onTrigger,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const cutoff24 = Date.now() - DAY_MS;

    return ENDPOINTS.map((ep) => {
      const scoped = scopeIds.length
        ? runs.filter((r) => !r.property_id || scopeIds.includes(r.property_id))
        : runs;
      const mine = scoped.filter((r) => ep.actions.includes(r.action));
      const lastRun = mine[0] ?? null; // runs arrive newest-first

      // Expand each run into the calls it actually represents. Multi-unit pushes
      // record one entry per unit in `details.units[]`, so a 4-unit property
      // contributes 4 calls — not 1 — and the failing unit can be named.
      const calls: Call[] = [];
      for (const r of mine) {
        const units = ep.unitField ? ((r.details as any)?.units as any[] | undefined) : undefined;
        if (Array.isArray(units) && units.length > 0) {
          for (const u of units) {
            const field = ep.unitField as string;
            const raw = u?.[field];
            const ok = typeof raw === "boolean" ? raw : u?.success === true;
            const err =
              (field === "availability_pushed" && u?.availability_error) ||
              (field === "prices_pushed" && u?.prices_error) ||
              u?.error ||
              null;
            calls.push({ at: r.created_at, success: ok, unit: u?.name ?? null, error: ok ? null : String(err ?? "Failed") });
          }
        } else {
          calls.push({
            at: r.created_at,
            success: r.success,
            unit: null,
            error: r.success ? null : r.error_message ?? "Failed",
          });
        }
      }

      const rate = (list: Call[]) =>
        list.length ? Math.round((list.filter((c) => c.success).length / list.length) * 100) : null;

      const recent = calls.filter((c) => new Date(c.at).getTime() >= cutoff24);
      const rate24 = rate(recent);
      const rate7d = rate(calls);
      const ok7d = calls.filter((c) => c.success).length;

      // Latest run health: derived from the calls belonging to the newest run only.
      const lastCalls = lastRun ? calls.filter((c) => c.at === lastRun.created_at) : [];
      const lastOk = lastCalls.length > 0 ? lastCalls.every((c) => c.success) : lastRun?.success === true;

      // Coverage: distinct properties touched vs expected (property-scoped endpoints only).
      const touched = new Set(mine.filter((r) => r.property_id).map((r) => r.property_id as string));
      const denom = Math.max(expectedProperties, touched.size);
      const coverage = ep.scoped && denom > 0 ? Math.min(100, Math.round((touched.size / denom) * 100)) : null;
      const coverageIncomplete = coverage !== null && coverage < 100;

      const olderFailures = calls.filter((c) => !c.success && (!lastRun || c.at !== lastRun.created_at)).length;

      // RU owner accounts the runs authenticated as, and whether any scoped run
      // was pushed on the master account (a white-label mis-auth signal).
      const owners = new Set<string>();
      let masterScoped = false;
      for (const r of mine) {
        const d = (r.details ?? {}) as Record<string, unknown>;
        const owner = d.ru_owner_id ?? d.owner_scope;
        if (owner) owners.add(String(owner));
        if (ep.scoped && String(d.owner_scope ?? "").toLowerCase() === "master") masterScoped = true;
      }

      let status: "ok" | "degraded" | "failing" | "never";
      let reason: string;
      if (calls.length === 0) {
        status = "never";
        reason = "No runs in the last 7 days.";
      } else if (!lastOk) {
        // The current state is broken — red only when it is broken repeatedly.
        status = (rate24 ?? 0) < 50 ? "failing" : "degraded";
        reason = "The most recent run did not fully succeed.";
      } else if (rate24 !== null && rate24 < 100) {
        status = "degraded";
        reason = "Latest run passed, but there were failures in the last 24 hours.";
      } else if (coverageIncomplete) {
        status = "degraded";
        reason = "Latest run passed, but not every expected property was covered.";
      } else if (masterScoped) {
        status = "degraded";
        reason = "A property-scoped run authenticated on the master account.";
      } else if (olderFailures > 0) {
        status = "ok";
        reason = `Recovered — ${olderFailures} older failure${olderFailures === 1 ? "" : "s"} in the 7-day window.`;
      } else {
        status = "ok";
        reason = "Every call in the window succeeded.";
      }

      const failures = calls.filter((c) => !c.success).slice(0, 12);

      return {
        ep,
        lastRun,
        lastOk,
        rate24,
        rate7d,
        ok7d,
        total7d: calls.length,
        recentCount: recent.length,
        coverage,
        touched: touched.size,
        denom,
        status,
        reason,
        owners: Array.from(owners),
        masterScoped,
        olderFailures,
        failures,
      };
    });
  }, [runs, scopeIds, expectedProperties]);

  // ── RAG (red / amber / green) severity model ────────────────────────────────
  // green  = latest run clean, no failures in 24h, coverage complete
  // amber  = latest run partial, a failure in 24h, partial coverage, or no run
  // red    = latest run failed and the 24h majority is failing
  type Rag = "green" | "amber" | "red";

  const RAG: Record<Rag, { label: string; dot: string; text: string; border: string; bar: string; chip: string }> = {
    green: {
      label: "Green",
      dot: "bg-emerald-600",
      text: "text-emerald-600",
      border: "border-l-emerald-600",
      bar: "[&>div]:bg-emerald-600",
      chip: "bg-emerald-600 text-white hover:bg-emerald-600",
    },
    amber: {
      label: "Amber",
      dot: "bg-amber-500",
      text: "text-amber-600",
      border: "border-l-amber-500",
      bar: "[&>div]:bg-amber-500",
      chip: "bg-amber-500 text-black hover:bg-amber-500",
    },
    red: {
      label: "Red",
      dot: "bg-destructive",
      text: "text-destructive",
      border: "border-l-destructive",
      bar: "[&>div]:bg-destructive",
      chip: "bg-destructive text-destructive-foreground hover:bg-destructive",
    },
  };

  const ragOf = (status: string): Rag =>
    status === "ok" ? "green" : status === "failing" ? "red" : "amber";

  const ragLabel = (status: string) =>
    status === "ok" ? "Healthy" : status === "degraded" ? "Degraded" : status === "failing" ? "Failing" : "Never run";

  const statusBadge = (status: string) => (
    <Badge className={`text-[11px] ${RAG[ragOf(status)].chip}`}>{ragLabel(status)}</Badge>
  );

  const statusIcon = (status: string) => {
    if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    if (status === "failing") return <XCircle className="h-4 w-4 text-destructive" />;
    if (status === "never") return <CircleDashed className="h-4 w-4 text-amber-500" />;
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  };

  // A metric bar gets its own RAG: >=90% green, >=50% amber, below that red.
  const barRag = (pct: number | null, hasData: boolean): Rag => {
    if (!hasData) return "amber";
    const v = pct ?? 0;
    return v >= 90 ? "green" : v >= 50 ? "amber" : "red";
  };

  const pushRows = rows.filter((r) => r.ep.direction === "push");
  const pullRows = rows.filter((r) => r.ep.direction === "pull");

  const renderGroup = (title: string, icon: React.ReactNode, group: typeof rows) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {group.map((row) => {
        const {
          ep,
          lastRun,
          rate24,
          rate7d,
          ok7d,
          total7d,
          recentCount,
          coverage,
          touched,
          denom,
          status,
          reason,
          owners,
          masterScoped,
          failures,
        } = row;
        const open = expanded === ep.method;
        return (
          <div key={ep.method} className={`rounded-md border border-l-4 p-3 space-y-2 ${RAG[ragOf(status)].border}`}>
            <div className="flex flex-wrap items-center gap-2">
              {statusIcon(status)}
              <span className="font-medium text-sm">{ep.label}</span>
              <code className="text-[10px] text-muted-foreground">{ep.method}</code>
              {statusBadge(status)}
              <span className="ml-auto text-xs text-muted-foreground">
                {lastRun
                  ? `Last run ${formatDistanceToNow(new Date(lastRun.created_at), { addSuffix: true })}`
                  : "No runs in 7 days"}
              </span>
              {ep.fn && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={triggering !== null}
                  onClick={() => onTrigger(ep.fn as string, ep.label, ep.scoped)}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${triggering === ep.fn ? "animate-spin" : ""}`} />
                  Run
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>Current health (24h)</span>
                  <span>{recentCount ? `${rate24}% of ${recentCount} calls` : "no calls in 24h"}</span>
                </div>
                <Progress
                  value={rate24 ?? 0}
                  className={`h-1.5 ${RAG[barRag(rate24, recentCount > 0)].bar}`}
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{ep.scoped ? "Property coverage" : "Scope"}</span>
                  <span>{ep.scoped ? `${touched}/${denom} properties` : "Account-level"}</span>
                </div>
                <Progress
                  value={coverage ?? (total7d ? 100 : 0)}
                  className={`h-1.5 ${RAG[barRag(coverage ?? (total7d ? 100 : 0), total7d > 0)].bar}`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className={RAG[ragOf(status)].text}>{reason}</span>
              <span>
                7-day context: {ok7d}/{total7d} calls{rate7d !== null ? ` (${rate7d}%)` : ""}
              </span>
              {owners.length > 0 && (
                <span className="flex items-center gap-1">
                  <KeyRound className="h-3 w-3" />
                  {owners.length === 1 ? `as sub-user ${owners[0]}` : `accounts ${owners.join(", ")}`}
                </span>
              )}
              {failures.length > 0 && (
                <button
                  type="button"
                  className="flex items-center gap-1 underline decoration-dotted"
                  onClick={() => setExpanded(open ? null : ep.method)}
                >
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {failures.length} recent failure{failures.length === 1 ? "" : "s"}
                </button>
              )}
            </div>

            {masterScoped && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-600">
                <ShieldAlert className="h-3 w-3" />
                A property-scoped run used master credentials — white-label inventory must be pushed as the
                owning sub-user.
              </p>
            )}

            {open && failures.length > 0 && (
              <div className="rounded border bg-muted/40 p-2 space-y-1">
                {failures.map((f, i) => (
                  <div key={`${f.at}-${i}`} className="text-[11px] leading-snug">
                    <span className="text-muted-foreground">{format(new Date(f.at), "dd MMM HH:mm")}</span>
                    {f.unit && <span className="ml-1.5 font-medium">{f.unit}</span>}
                    <span className="ml-1.5 text-destructive">{f.error}</span>
                  </div>
                ))}
              </div>
            )}

            {ep.note && <p className="text-[11px] text-muted-foreground">{ep.note}</p>}
          </div>
        );
      })}
    </div>
  );

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Endpoint progress tracker</CardTitle>
        <p className="text-xs text-muted-foreground">
          Health, latest run and coverage for every push and pull endpoint in the RU implementation
          {scopeIds.length ? ` — filtered to ${scopeIds.length} selected propert${scopeIds.length === 1 ? "y" : "ies"}` : ""}.
          Grading follows the latest run and the last 24 hours; the 7-day figure is context only.
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-600" /> Green — latest run clean, no failures in 24h
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Amber — partial run, recent failure, partial coverage or no run
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive" /> Red — latest run failed and most 24h calls are failing
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {renderGroup("Push to Rentals United", <ArrowUpFromLine className="h-3.5 w-3.5" />, pushRows)}
        {renderGroup("Pull from Rentals United", <ArrowDownToLine className="h-3.5 w-3.5" />, pullRows)}
      </CardContent>
    </Card>
  );
}
