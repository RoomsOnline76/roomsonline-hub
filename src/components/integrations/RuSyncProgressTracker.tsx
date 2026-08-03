import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpFromLine, ArrowDownToLine, CheckCircle2, XCircle, AlertTriangle, CircleDashed, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface TrackerRun {
  created_at: string;
  action: string;
  property_id: string | null;
  success: boolean;
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
  },
  {
    method: "Push_PutAvbUnits_RQ",
    label: "Availability (units)",
    direction: "push",
    actions: ["refresh_ari", "PutAvbUnits"],
    fn: "cron-refresh-ru-ari",
    scoped: true,
  },
  {
    method: "Push_PutLongStayPrices_RQ",
    label: "Prices",
    direction: "push",
    actions: ["refresh_ari", "PutPrices"],
    fn: "cron-refresh-ru-ari",
    scoped: true,
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
  /** Manual scope; empty means every RU-enabled property. */
  scopeIds: string[];
  /** Number of properties currently expected to sync. */
  expectedProperties: number;
  triggering: string | null;
  onTrigger: (fn: string, label: string, scoped: boolean) => void;
}

/**
 * Per-endpoint progress and health for the whole RU implementation (push and pull),
 * derived from the last 7 days of `ru_sync_runs`.
 */
export function RuSyncProgressTracker({ runs, scopeIds, expectedProperties, triggering, onTrigger }: Props) {
  const rows = useMemo(() => {
    return ENDPOINTS.map((ep) => {
      const scoped = scopeIds.length
        ? runs.filter((r) => !r.property_id || scopeIds.includes(r.property_id))
        : runs;
      const mine = scoped.filter((r) => ep.actions.includes(r.action));
      const ok = mine.filter((r) => r.success).length;
      const total = mine.length;
      const last = mine[0] ?? null; // runs arrive newest-first
      const successRate = total ? Math.round((ok / total) * 100) : 0;
      // Coverage: distinct properties touched vs expected (property-scoped endpoints only).
      const touched = new Set(mine.filter((r) => r.property_id).map((r) => r.property_id as string));
      // Historic runs can include properties since paused, so the denominator
      // is whichever is larger: currently expected, or actually touched.
      const denom = Math.max(expectedProperties, touched.size);
      const coverage =
        ep.scoped && denom > 0 ? Math.min(100, Math.round((touched.size / denom) * 100)) : null;
      const status: "ok" | "degraded" | "failing" | "never" =
        total === 0 ? "never" : successRate === 100 ? "ok" : successRate >= 50 ? "degraded" : "failing";
      return { ep, ok, total, last, successRate, coverage, touched: touched.size, denom, status };
    });
  }, [runs, scopeIds, expectedProperties]);

  // ── RAG (red / amber / green) severity model ────────────────────────────────
  // green  = every call in the window succeeded and coverage is complete
  // amber  = partial success, partial coverage, or no run in the window
  // red    = majority of calls failing
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
      {group.map(({ ep, ok, total, last, successRate, coverage, touched, denom, status }) => (
        <div key={ep.method} className={`rounded-md border border-l-4 p-3 space-y-2 ${RAG[ragOf(status)].border}`}>
          <div className="flex flex-wrap items-center gap-2">
            {statusIcon(status)}
            <span className="font-medium text-sm">{ep.label}</span>
            <code className="text-[10px] text-muted-foreground">{ep.method}</code>
            {statusBadge(status)}
            <span className="ml-auto text-xs text-muted-foreground">
              {last ? `Last run ${formatDistanceToNow(new Date(last.created_at), { addSuffix: true })}` : "No runs in 7 days"}
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
                <span>Success rate (7d)</span>
                <span>
                  {ok}/{total} calls
                </span>
              </div>
              <Progress
                value={total ? successRate : 0}
                className={`h-1.5 ${RAG[barRag(successRate, total > 0)].bar}`}
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{ep.scoped ? "Property coverage" : "Scope"}</span>
                <span>
                  {ep.scoped
                    ? `${touched}/${denom} properties`
                    : "Account-level"}
                </span>
              </div>
              <Progress
                value={coverage ?? (total ? 100 : 0)}
                className={`h-1.5 ${RAG[barRag(coverage ?? (total ? 100 : 0), total > 0)].bar}`}
              />
            </div>
          </div>

          {ep.note && <p className="text-[11px] text-muted-foreground">{ep.note}</p>}
        </div>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Endpoint progress tracker</CardTitle>
        <p className="text-xs text-muted-foreground">
          Health, latest run and coverage for every push and pull endpoint in the RU implementation
          {scopeIds.length ? ` — filtered to ${scopeIds.length} selected propert${scopeIds.length === 1 ? "y" : "ies"}` : ""}.
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-600" /> Green — all calls succeeded, full coverage
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Amber — partial success/coverage or no run in 7 days
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive" /> Red — majority of calls failing
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
