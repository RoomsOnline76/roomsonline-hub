import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useRuLiveTraffic, type RuLiveTrafficErrors, type RuLiveTrafficRow } from "@/hooks/useRuLiveTraffic";
import { adminUrl } from "@/lib/config";
import { RU_ENDPOINT_CADENCE_LABELS, RU_ENDPOINT_FAMILY_LABELS, resolveRuEndpoint } from "@/config/ruEndpointLibrary";
import { EndpointCounterTable } from "./EndpointCounterTable";
import { TrafficPulseStrip } from "./TrafficPulseStrip";

/**
 * Side-by-side live view of channel traffic: what ROL'OS sent on the left, what came back on the
 * right, aligned row for row so an operator reads one exchange as one line. Selecting an exchange
 * pins its full payloads underneath.
 */

const LIVE_ROUTE = "/admin/channel-monitor/live";

function outcomeOf(row: RuLiveTrafficRow): "ok" | "deferred" | "failed" {
  if (row.transport_status === "rate_deferred") return "deferred";
  return row.success ? "ok" : "failed";
}

const OUTCOME_TONE: Record<"ok" | "deferred" | "failed", string> = {
  ok: "border-emerald-300 bg-emerald-100 text-emerald-900",
  deferred: "border-amber-300 bg-amber-100 text-amber-900",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};

const OUTCOME_LABEL: Record<"ok" | "deferred" | "failed", string> = {
  ok: "delivered",
  deferred: "throttled",
  failed: "failed",
};

/**
 * Some ledger rows record a decision, not a wire call: the channel's sliding-minute gate parked the
 * write ("rate_deferred"), or ROL'OS reopened the stay's nights and queued the acceptance
 * ("not_attempted"). Those rows legitimately carry no XML, so the pane explains what happened
 * instead of implying the payload was lost.
 */
function payloadPlaceholder(row: RuLiveTrafficRow, side: "request" | "response"): string {
  const reason = row.error_message?.trim();
  if (row.transport_status === "not_attempted") {
    return [
      `This exchange never left ROL'OS — no ${side} payload exists.`,
      reason || "The write was queued for the next available channel slot.",
    ].join("\n\n");
  }
  if (row.transport_status === "rate_deferred") {
    return [
      `The channel's one-call-per-minute gate held this call back, so there is no ${side} payload.`,
      reason || "Retry once the sliding minute closes.",
    ].join("\n\n");
  }
  if (side === "response" && row.transport_status === "empty_response") {
    return reason || "The channel answered with an empty body.";
  }
  return `No ${side} payload retained.`;
}

/** Rows recorded before the key-mint schema-order fix put Scope before Label. */
function isLegacyShape(row: RuLiveTrafficRow): boolean {
  if (row.action !== "Push_CreateApiKey_RQ") return false;
  const xml = row.request_xml ?? "";
  const scopeIndex = xml.indexOf("<Scope>");
  const labelIndex = xml.indexOf("<Label>");
  return scopeIndex >= 0 && labelIndex >= 0 && scopeIndex < labelIndex;
}



function bytes(value: number | null): string {
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} kB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function ReadErrorList({ errors }: { errors: RuLiveTrafficErrors }) {
  const entries = [
    ["Endpoint counters", errors.counters],
    ["Live feed", errors.feed],
    ["Pulse windows", errors.pulse],
    ["Throttle queue", errors.queue],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {entries.map(([label, message]) => (
        <p key={label}>
          <span className="font-medium">{label} read failed:</span> {message}
        </p>
      ))}
    </div>
  );
}

interface Props {
  /** In the popped-out window the pop-out button is pointless. */
  popped?: boolean;
}

export function LiveTrafficFrame({ popped = false }: Props) {
  const {
    rows,
    counters,
    pulse,
    queue,
    unregistered,
    connected,
    paused,
    setPaused,
    loading,
    errors,
    lastEventAt,
    refresh,
    clear,
  } = useRuLiveTraffic();

  const [search, setSearch] = useState("");
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (failuresOnly && outcomeOf(row) === "ok") return false;
      if (!needle) return true;
      return [row.action, row.parent_action, row.trace_id, row.ru_owner_id, row.ru_property_id, row.error_message]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [rows, search, failuresOnly]);

  const selected = useMemo(
    () => filtered.find((r) => r.id === selectedId) ?? rows.find((r) => r.id === selectedId) ?? null,
    [filtered, rows, selectedId],
  );

  const openPopout = () => {
    const features = "popup=yes,width=1180,height=820,noopener=no";
    const child = window.open(adminUrl(LIVE_ROUTE), "rol-live-traffic", features);
    child?.focus();
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Live channel traffic
              <Badge
                variant="outline"
                className={connected ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-border"}
              >
                {connected ? "streaming" : "connecting…"}
              </Badge>
              {paused ? <Badge variant="outline">paused</Badge> : null}
            </CardTitle>
            <CardDescription>
              Outbound payloads and the channel's replies, side by side as they happen. Counters cover
              every endpoint in the implemented library.
              {lastEventAt ? ` Last exchange ${formatDistanceToNow(new Date(lastEventAt))} ago.` : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPaused(!paused)}>
              {paused ? <Play className="mr-2 h-3.5 w-3.5" /> : <Pause className="mr-2 h-3.5 w-3.5" />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={clear}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Clear feed
            </Button>
            {!popped ? (
              <Button variant="outline" size="sm" onClick={openPopout}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Pop out
              </Button>
            ) : null}
          </div>
        </div>

        <TrafficPulseStrip pulse={pulse} queue={queue} />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by method, trace id, account or error"
              className="pl-8"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={failuresOnly} onCheckedChange={setFailuresOnly} />
            Problems only
          </label>
        </div>

        {unregistered.length > 0 ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Unregistered endpoint{unregistered.length > 1 ? "s" : ""} seen on the wire:{" "}
            {unregistered.map((u) => u.action).join(", ")}. Add them to the endpoint library so cadence
            expectations are recorded.
          </p>
        ) : null}
        <ReadErrorList errors={errors} />
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-[1fr_1fr] gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Outbound request</span>
          <span>Inbound response</span>
        </div>

        <ScrollArea className="h-[420px] rounded-md border">
          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : errors.feed ? (
            <p className="p-6 text-center text-sm text-destructive">
              Live feed read failed: {errors.feed}
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No exchanges in the live window yet.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((row) => {
                const outcome = outcomeOf(row);
                const spec = resolveRuEndpoint(row.action);
                const isSelected = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(isSelected ? null : row.id)}
                      className={`grid w-full grid-cols-[1fr_1fr] gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60 ${
                        isSelected ? "bg-muted" : ""
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {format(new Date(row.created_at), "HH:mm:ss")}
                          </span>
                          <span className="truncate font-medium">{row.action}</span>
                          {row.direction === "inbound" ? <Badge variant="outline">inbound</Badge> : null}
                          {isLegacyShape(row) ? (
                            <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
                              legacy — pre-fix order
                            </Badge>
                          ) : null}
                        </div>


                        <p className="truncate text-muted-foreground">
                          {spec ? `${RU_ENDPOINT_FAMILY_LABELS[spec.family]} · ${RU_ENDPOINT_CADENCE_LABELS[spec.cadence]}` : "Unregistered endpoint"}
                          {row.parent_action ? ` · ${row.parent_action}` : ""}
                        </p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {(row.request_xml ?? "").slice(0, 160) || "no payload retained"}
                        </p>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={OUTCOME_TONE[outcome]}>
                            {OUTCOME_LABEL[outcome]}
                          </Badge>
                          {row.status_id ? <span className="font-mono">status {row.status_id}</span> : null}
                          {row.elapsed_ms != null ? <span>{row.elapsed_ms} ms</span> : null}
                          <span className="text-muted-foreground">
                            {bytes(row.request_bytes)} ↑ / {bytes(row.response_bytes)} ↓
                          </span>
                        </div>
                        <p className="truncate text-muted-foreground">
                          {row.error_message || row.status_message || (row.response_id ? `ResponseID ${row.response_id}` : "—")}
                        </p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {(row.response_xml ?? "").slice(0, 160) || "no payload retained"}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        {selected ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Request · {selected.action}
              </p>
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed">
                {selected.request_xml ?? payloadPlaceholder(selected, "request")}
              </pre>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Response{selected.trace_id ? ` · trace ${selected.trace_id}` : ""}
              </p>
              <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed">
                {selected.response_xml ?? "No response payload retained."}
              </pre>
            </div>
          </div>
        ) : null}

        <EndpointCounterTable counters={counters} error={errors.counters} />
      </CardContent>
    </Card>
  );
}
