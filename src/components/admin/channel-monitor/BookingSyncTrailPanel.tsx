import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FileSearch,
  RefreshCw,
  Search,
  X,
} from "lucide-react";


/**
 * Booking action trail.
 *
 * Every booking verb in either direction lands here — including the ones that resolve as `skipped`,
 * because a skip is the evidence that the sync ran and made a decision. Staff use this to answer
 * "did that move reach the channel?" without reading raw XML: the exchange log holds the payload,
 * this holds the decision.
 */

interface TrailRow {
  id: string;
  created_at: string;
  booking_id: string | null;
  property_id: string | null;
  direction: string;
  action: string;
  source: string | null;
  outcome: string;
  reason: string | null;
  channel_reservation_id: string | null;
  channel_listing_id: string | null;
  trace_id: string | null;
  summary: string | null;
}

const ACTIONS = [
  "created", "moved", "dates", "pax", "price", "deposit", "payment",
  "notes", "confirmed", "cancelled", "no_show", "status", "request", "modified",
];

const OUTCOME_TONE: Record<string, string> = {
  pushed: "bg-primary text-primary-foreground",
  ingested: "bg-primary text-primary-foreground",
  queued: "bg-secondary text-secondary-foreground",
  skipped: "bg-muted text-muted-foreground",
  failed: "bg-destructive text-destructive-foreground",
};

const ACTION_LABEL: Record<string, string> = {
  no_show: "no-show",
  pax: "guest count",
  dates: "date change",
};

interface BookingSyncTrailPanelProps {
  properties: Array<{ id: string; name: string }>;
  /** Opens the exchange log on a trace id / verb so the raw XML sits next to the decision row. */
  onInspectExchange?: (term: string) => void;
}

export function BookingSyncTrailPanel({ properties, onInspectExchange }: BookingSyncTrailPanelProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TrailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [outcome, setOutcome] = useState<string>("all");
  const [propertyId, setPropertyId] = useState<string>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Typed as `string` on purpose: the literal select string is not worth type-level parsing.
      const sel = (s: string): string => s;
      let query = supabase
        .from("channel_booking_events")
        .select(
          sel(
            "id, created_at, booking_id, property_id, direction, action, source, outcome, reason, channel_reservation_id, channel_listing_id, trace_id, summary",
          ),
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (direction !== "all") query = query.eq("direction", direction);
      if (action !== "all") query = query.eq("action", action);
      if (outcome !== "all") query = query.eq("outcome", outcome);
      if (propertyId !== "all") query = query.eq("property_id", propertyId);
      const term = search.trim().replace(/[,()]/g, " ");
      if (term) {
        query = query.or(
          [
            `summary.ilike.%${term}%`,
            `reason.ilike.%${term}%`,
            `action.ilike.%${term}%`,
            `source.ilike.%${term}%`,
            `channel_reservation_id.ilike.%${term}%`,
            `trace_id.ilike.%${term}%`,
          ].join(","),
        );
      }

      const { data, error: queryError } = await query.returns<TrailRow[]>();
      if (queryError) throw queryError;
      setRows(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the booking trail");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [direction, action, outcome, propertyId, search]);

  // Nothing is fetched until the trail is first expanded — the diagnostics tab stays light.
  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);


  const propertyName = useMemo(() => {
    const map = new Map(properties.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "Account level");
  }, [properties]);

  const stats = useMemo(() => {
    const count = (o: string) => rows.filter((r) => r.outcome === o).length;
    return {
      total: rows.length,
      failed: count("failed"),
      queued: count("queued"),
      skipped: count("skipped"),
      inbound: rows.filter((r) => r.direction === "inbound").length,
    };
  }, [rows]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex flex-1 items-start gap-3 text-left">
              {open ? (
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div>
                <CardTitle>Booking sync trail</CardTitle>
                <CardDescription>
                  Every booking action in both directions — created, moved, dates, guest count,
                  price, deposit, notes, confirmation, cancellation and no-show — with what the
                  channel did about it. Skips are recorded too, so silence is never ambiguous.
                </CardDescription>
                {open && (
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span>{stats.total} events</span>
                    <span>{stats.inbound} inbound</span>
                    <span>{stats.queued} queued</span>
                    <span>{stats.skipped} skipped</span>
                    <span className={stats.failed ? "text-destructive" : undefined}>
                      {stats.failed} failed
                    </span>
                  </div>
                )}
              </div>
            </button>
          </CollapsibleTrigger>
          {open && (
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSearch(searchDraft.trim());
                }}
                placeholder="Search a reservation id, trace id, action or reason (e.g. cancel)"
              />
              <Button
                variant="secondary"
                size="icon"
                aria-label="Search booking trail"
                onClick={() => setSearch(searchDraft.trim())}
              >
                <Search className="h-4 w-4" />
              </Button>
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Clear booking trail search"
                  onClick={() => {
                    setSearchDraft("");
                    setSearch("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger><SelectValue placeholder="Direction" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Both directions</SelectItem>
                  <SelectItem value="outbound">ROL'OS → channel</SelectItem>
                  <SelectItem value="inbound">Channel → ROL'OS</SelectItem>
                </SelectContent>
              </Select>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>{ACTION_LABEL[a] ?? a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger><SelectValue placeholder="Outcome" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  <SelectItem value="pushed">Pushed</SelectItem>
                  <SelectItem value="ingested">Ingested</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger><SelectValue placeholder="Property" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All properties</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No booking actions recorded for this filter yet.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {rows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    {row.direction === "inbound" ? (
                      <ArrowDownLeft className="h-4 w-4 text-muted-foreground" aria-label="Inbound" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-label="Outbound" />
                    )}
                    <span className="font-medium">{ACTION_LABEL[row.action] ?? row.action}</span>
                    <Badge className={OUTCOME_TONE[row.outcome] ?? "bg-muted text-muted-foreground"}>
                      {row.outcome}
                    </Badge>
                    <span className="text-muted-foreground">{propertyName(row.property_id)}</span>
                    {row.channel_reservation_id && (
                      <span className="font-mono text-xs text-muted-foreground">
                        res {row.channel_reservation_id}
                      </span>
                    )}
                    <span className="flex-1 min-w-[12rem] text-muted-foreground">
                      {row.summary ?? row.reason ?? ""}
                    </span>
                    {row.source && <span className="text-xs text-muted-foreground">{row.source}</span>}
                    {onInspectExchange && (row.trace_id || row.channel_reservation_id) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          onInspectExchange(row.trace_id || row.channel_reservation_id || "")
                        }
                      >
                        <FileSearch className="mr-1 h-4 w-4" />
                        View exchange
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
