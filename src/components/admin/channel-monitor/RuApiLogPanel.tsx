import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Download, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DEFAULT_RU_API_LOG_FILTERS,
  RU_BOOKING_CHIPS,
  ruApiLogOutcomeOf,
  useRuApiLog,
  type RuApiLogDetail,
  type RuApiLogFilters,
  type RuApiLogRow,
} from "@/hooks/useRuApiLog";

interface RuApiLogPanelProps {
  properties: { id: string; name: string }[];
  /**
   * Deep link from the booking trail: a trace id (or verb) to look up immediately.
   * Bumped `key` on the caller side is not needed — the value change drives the search.
   */
  searchTerm?: string;
}


const DAY_OPTIONS = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "0", label: "Full retention" },
];

const formatBytes = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
};

const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** Compact pill group used for the most-used log dimensions. Presentation only. */
function SegmentedFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-xs transition-colors",
              value === o.value
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}


/**
 * Support console for the durable exchange log.
 *
 * Certification asks for one thing above all: given a ResponseID, produce the exact request and
 * response that were exchanged. The ResponseID lookup therefore ignores every other filter, and
 * each exchange can be exported as a bundle to attach to a support ticket.
 */
export function RuApiLogPanel({ properties, searchTerm }: RuApiLogPanelProps) {
  const [filters, setFilters] = useState<RuApiLogFilters>(DEFAULT_RU_API_LOG_FILTERS);
  const [searchDraft, setSearchDraft] = useState("");
  const [detail, setDetail] = useState<RuApiLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // A deep link from the booking trail lands as a search term; mirror it into the box so the
  // operator can see (and clear) what is being looked up.
  useEffect(() => {
    const term = (searchTerm ?? "").trim();
    if (!term) return;
    setSearchDraft(term);
    setFilters((prev) => ({ ...prev, search: term }));
  }, [searchTerm]);




  const {
    rows,
    actions,
    operations,
    owners,
    actionCounts,
    inboundCount,
    stats,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    loadDetail,
  } = useRuApiLog(filters);



  const propertyNames = useMemo(
    () => new Map(properties.map((p) => [p.id, p.name])),
    [properties],
  );

  const patch = useCallback(
    (next: Partial<RuApiLogFilters>) => setFilters((prev) => ({ ...prev, ...next })),
    [],
  );

  const openDetail = useCallback(
    async (row: RuApiLogRow) => {
      setDetailLoading(true);
      try {
        const full = await loadDetail(row.id);
        if (!full) {
          toast.error("That exchange is no longer retained");
          return;
        }
        setDetail(full);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not open the exchange");
      } finally {
        setDetailLoading(false);
      }
    },
    [loadDetail],
  );

  const copy = useCallback(async (value: string | null, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, []);

  const exportDetail = useCallback(
    (entry: RuApiLogDetail) => {
      const bundle = [
        "Channel Manager API exchange — support bundle",
        `Exchange id      : ${entry.id}`,
        `Timestamp (UTC)  : ${entry.created_at}`,
        `Action           : ${entry.action}`,
        `Triggered by     : ${entry.parent_action ?? "—"}`,
        `Trace id         : ${entry.trace_id ?? "—"}`,
        `Property         : ${propertyNames.get(entry.property_id ?? "") ?? entry.property_id ?? "—"}`,
        `Channel prop id  : ${entry.ru_property_id ?? "—"}`,
        `Account / sub-user: ${entry.ru_owner_id ?? "—"} / ${entry.ru_user_id ?? "—"}`,
        `Endpoint         : ${entry.endpoint ?? "—"}`,
        `HTTP status      : ${entry.http_status ?? "—"}`,
        `Status           : ${entry.status_id ?? "—"} ${entry.status_message ?? ""}`,
        `ResponseID       : ${entry.response_id ?? "—"}`,
        `Duration         : ${entry.elapsed_ms ?? "—"} ms`,
        `Retained until   : ${entry.expires_at}`,
        "",
        "--- REQUEST (credentials redacted) ---",
        entry.request_xml ?? "(not stored)",
        "",
        "--- RESPONSE ---",
        entry.response_xml ?? "(not stored)",
        "",
      ].join("\n");

      const blob = new Blob([bundle], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `channel-exchange-${entry.response_id || entry.id}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    },
    [propertyNames],
  );

  const exportFiltered = useCallback(() => {
    if (!rows.length) return;
    const header = [
      "timestamp",
      "action",
      "triggered_by",
      "property",
      "channel_property_id",
      "response_id",
      "status_id",
      "http_status",
      "outcome",
      "success",
      "elapsed_ms",
      "error",
    ].join(",");
    const csvRows = rows.map((r) =>
      [
        r.created_at,
        r.action,
        r.parent_action ?? "",
        propertyNames.get(r.property_id ?? "") ?? r.property_id ?? "",
        r.ru_property_id ?? "",
        r.response_id ?? "",
        r.status_id ?? "",
        r.http_status ?? "",
        ruApiLogOutcomeOf(r),
        r.success ? "yes" : "no",
        r.elapsed_ms ?? "",
        (r.error_message ?? "").replace(/[",\n]/g, " "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...csvRows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `channel-exchange-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [rows, propertyNames]);

  const submitSearch = useCallback(() => {
    patch({ search: searchDraft.trim() });
  }, [patch, searchDraft]);

  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Presentation-only split: the four lifecycle verbs read as "bookings", the rest as polling.
  const bookingStats = useMemo(() => RU_BOOKING_CHIPS.slice(0, 4), []);
  const otherStats = useMemo(() => RU_BOOKING_CHIPS.slice(4), []);

  const advancedActive = [
    filters.ownerId !== "all",
    filters.propertyId !== "all",
    filters.action !== "all",
    filters.operation !== "all",
  ].filter(Boolean).length;

  const statCount = useCallback(
    (chip: (typeof RU_BOOKING_CHIPS)[number]) => (chip.inbound ? inboundCount : actionCounts.get(chip.key) ?? 0),
    [actionCounts, inboundCount],
  );

  const statActive = useCallback(
    (chip: (typeof RU_BOOKING_CHIPS)[number]) =>
      chip.inbound ? filters.direction === "inbound" && filters.action === "all" : filters.action === chip.key,
    [filters.action, filters.direction],
  );

  const toggleStat = useCallback(
    (chip: (typeof RU_BOOKING_CHIPS)[number], active: boolean) => {
      setSearchDraft("");
      if (chip.inbound) {
        patch({ search: "", action: "all", direction: active ? "all" : "inbound", bookingsOnly: false });
      } else {
        patch({ search: "", direction: "all", bookingsOnly: false, action: active ? "all" : chip.key });
      }
    },
    [patch],
  );

  const renderStat = (chip: (typeof RU_BOOKING_CHIPS)[number]) => {
    const count = statCount(chip);
    const active = statActive(chip);
    return (
      <button
        key={chip.key}
        type="button"
        disabled={count === 0}
        onClick={() => toggleStat(chip, active)}
        className={cn(
          "rounded-md px-2.5 py-1.5 text-left transition-colors",
          count === 0 ? "cursor-default opacity-50" : "hover:bg-muted",
          active && "bg-muted",
        )}
      >
        <div className={cn("text-sm font-semibold tabular-nums", active ? "text-foreground" : "text-foreground/80")}>
          {count}
        </div>
        <div className="text-[11px] leading-tight text-muted-foreground">{chip.label}</div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exchange log</CardTitle>
          <CardDescription className="text-xs">
            Every request and response exchanged with the channel manager is stored with its ResponseID and kept for
            90 days. Credentials are redacted before storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 1. Primary toolbar — search on the left, window and actions on the right. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitSearch();
                }}
                onBlur={submitSearch}
                className="h-9 pl-8 pr-8"
                placeholder="Find a call by ResponseID, action, or free text"
              />
              {filters.search && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Clear search"
                  className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => {
                    setSearchDraft("");
                    patch({ search: "" });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <Select value={String(filters.days)} onValueChange={(v) => patch({ days: Number(v) })}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" className="h-9" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={exportFiltered} disabled={!rows.length}>
              <Download className="mr-2 h-4 w-4" />
              Export list
            </Button>
          </div>

          {/* 2. Quick filters — segmented pills for the three most-used dimensions. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SegmentedFilter
              label="Scope"
              value={filters.bookingsOnly ? "bookings" : "all"}
              options={[
                { value: "all", label: "All" },
                { value: "bookings", label: "Bookings only" },
              ]}
              onChange={(v) => patch({ bookingsOnly: v === "bookings" })}
            />
            <SegmentedFilter
              label="Direction"
              value={filters.direction}
              options={[
                { value: "all", label: "Both" },
                { value: "outbound", label: "Outbound" },
                { value: "inbound", label: "Inbound" },
              ]}
              onChange={(v) => patch({ direction: v })}
            />
            <SegmentedFilter
              label="Outcome"
              value={filters.outcome}
              options={[
                { value: "all", label: "All" },
                { value: "success", label: "Success" },
                { value: "deferred", label: "Deferred" },
                { value: "failure", label: "Failed" },
              ]}
              onChange={(v) => patch({ outcome: v as RuApiLogFilters["outcome"] })}
            />

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="ml-auto">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  More filters
                  {advancedActive > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[11px]">
                      {advancedActive}
                    </Badge>
                  )}
                  <ChevronDown
                    className={cn("ml-1 h-4 w-4 transition-transform", advancedOpen && "rotate-180")}
                  />
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>

          {/* 3. Advanced filters — collapsed by default. */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleContent>
              <div className="rounded-md bg-muted/40 p-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Channel account</Label>
                    <Select value={filters.ownerId} onValueChange={(v) => patch({ ownerId: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All accounts</SelectItem>
                        {owners.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.value} ({o.count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Property</Label>
                    <Select value={filters.propertyId} onValueChange={(v) => patch({ propertyId: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All properties</SelectItem>
                        <SelectItem value="account">Account-level only</SelectItem>
                        {properties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Action</Label>
                    <Select value={filters.action} onValueChange={(v) => patch({ action: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All actions</SelectItem>
                        {actions.map((a) => (
                          <SelectItem key={a.value} value={a.value}>
                            {a.value} ({a.count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Operation</Label>
                    <Select value={filters.operation} onValueChange={(v) => patch({ operation: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All operations</SelectItem>
                        {operations.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.value} ({o.count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {advancedActive > 0 && (
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => patch({ ownerId: "all", propertyId: "all", action: "all", operation: "all" })}
                    >
                      Clear these filters
                    </Button>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* 4. Activity summary — secondary stats, still click-to-filter. */}
          <div className="rounded-md border border-border">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3 p-3">
              <div className="min-w-[220px]">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Bookings
                </div>
                <div className="flex flex-wrap gap-1">{bookingStats.map(renderStat)}</div>
              </div>
              <div className="min-w-[220px]">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Other exchanges
                </div>
                <div className="flex flex-wrap gap-1">{otherStats.map(renderStat)}</div>
              </div>
            </div>
            {RU_BOOKING_CHIPS.every((chip) => statCount(chip) === 0) && (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                None recorded in this window — widen the window.
              </p>
            )}
          </div>

          {/* 5. Results meta — quiet, right-aligned. */}
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {stats.totalCount != null
                ? `${stats.totalCount} exchanges match in window`
                : "Counting matches…"}
            </span>
            <span>·</span>
            <span>
              showing the newest {stats.total}
              {stats.truncated ? " — load more for older" : ""}
            </span>
            <span>·</span>
            <span>{stats.failures} failed (shown)</span>
            <span>·</span>
            <span title="Held locally by the one-call-per-minute channel gate and replayed by the background drainer — never sent, never a fault.">
              {stats.deferred} deferred (shown)
            </span>
            <span>·</span>
            <span>{stats.withResponseId} with ResponseID (shown)</span>
            <span>·</span>
            <span>avg {stats.avgMs} ms (shown)</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {loading && rows.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No exchanges match these filters. Nothing was recorded for this combination in
              the selected window — try a wider window or clear the filters.
            </p>
          ) : (
            <ScrollArea className="h-[560px] rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">When</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="px-3 py-2 text-left font-medium">Property</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">ResponseID</th>
                    <th className="px-3 py-2 text-right font-medium">Duration</th>
                    <th className="px-3 py-2 text-right font-medium">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "cursor-pointer border-t border-border/60 hover:bg-muted/50",
                        !row.success && "bg-destructive/5",
                      )}
                      onClick={() => void openDetail(row)}
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                        {formatTimestamp(row.created_at)}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="font-medium">{row.action}</div>
                        {row.parent_action && (
                          <div className="text-xs text-muted-foreground">{row.parent_action}</div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {propertyNames.get(row.property_id ?? "") ??
                          row.ru_property_id ??
                          (row.ru_owner_id ? `Account ${row.ru_owner_id}` : "—")}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge
                          variant={row.success ? "secondary" : "destructive"}
                          className={cn("text-[11px]", !row.success && "font-semibold")}
                        >
                          {row.success ? `OK ${row.status_id ?? ""}`.trim() : `Failed ${row.status_id ?? ""}`.trim()}
                        </Badge>
                        {row.error_message && (
                          <div className="max-w-[280px] truncate text-xs text-muted-foreground">
                            {row.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {row.response_id ? (
                          <span className="group inline-flex items-center gap-1">
                            <span className="font-mono text-xs">{row.response_id}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Copy ResponseID"
                              className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                void copy(row.response_id, "ResponseID");
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                        {row.elapsed_ms != null ? `${row.elapsed_ms} ms` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                        {formatBytes(row.request_bytes)} / {formatBytes(row.response_bytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasMore && (
                <div className="flex items-center justify-center gap-2 border-t border-border p-3">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load older exchanges"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {stats.totalCount != null
                      ? `${Math.max(stats.totalCount - stats.total, 0)} older still to load`
                      : ""}
                  </span>
                </div>
              )}

            </ScrollArea>
          )}

        </CardContent>
      </Card>


      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.action}</SheetTitle>
                <SheetDescription>
                  {formatTimestamp(detail.created_at)} · {detail.parent_action ?? "—"} · retained until{" "}
                  {new Date(detail.expires_at).toLocaleDateString()}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">ResponseID: </span>
                    <span className="font-mono">{detail.response_id ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status: </span>
                    {detail.status_id ?? "—"} {detail.status_message ?? ""}
                  </div>
                  <div>
                    <span className="text-muted-foreground">HTTP: </span>
                    {detail.http_status ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration: </span>
                    {detail.elapsed_ms != null ? `${detail.elapsed_ms} ms` : "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Property: </span>
                    {propertyNames.get(detail.property_id ?? "") ?? detail.property_id ?? "—"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Account / sub-user: </span>
                    {detail.ru_owner_id ?? "—"} / {detail.ru_user_id ?? "—"}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">Trace: </span>
                    <span className="font-mono text-xs">{detail.trace_id ?? "—"}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copy(detail.response_id, "ResponseID")}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy ResponseID
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void copy(detail.request_xml, "Request")}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy request
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void copy(detail.response_xml, "Response")}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy response
                  </Button>
                  <Button size="sm" onClick={() => exportDetail(detail)}>
                    <Download className="mr-2 h-4 w-4" />
                    Export bundle
                  </Button>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <Label className="text-xs">Request (credentials redacted)</Label>
                    <ScrollArea className="mt-1 h-[420px] rounded-md border bg-muted/30 p-2">
                      <pre className="whitespace-pre-wrap break-all font-mono text-[11px]">
                        {detail.request_xml ?? "(not stored)"}
                      </pre>
                    </ScrollArea>
                  </div>
                  <div>
                    <Label className="text-xs">Response</Label>
                    <ScrollArea className="mt-1 h-[420px] rounded-md border bg-muted/30 p-2">
                      <pre className="whitespace-pre-wrap break-all font-mono text-[11px]">
                        {detail.response_xml ?? "(not stored)"}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </>
          )}
          {detailLoading && !detail && <Skeleton className="h-64 w-full" />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
