import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Download, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DEFAULT_RU_API_LOG_FILTERS,
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




  const { rows, actions, operations, owners, stats, loading, loadingMore, hasMore, error, refresh, loadMore, loadDetail } =
    useRuApiLog(filters);



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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exchange log</CardTitle>
          <CardDescription>
            Every request and response exchanged with the channel manager — booking pushes,
            cancellations and inbound reservation notifications included — is stored with its
            ResponseID and kept for 90 days. Credentials are redacted before storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label className="text-xs">Find a call</Label>
              <div className="flex gap-2">
                <Input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitSearch();
                  }}
                  placeholder="Push_CancelReservation_RQ, a ResponseID, trace id or error text"
                />
                <Button variant="secondary" size="icon" onClick={submitSearch} aria-label="Search exchanges">
                  <Search className="h-4 w-4" />
                </Button>
                {filters.search && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchDraft("");
                      patch({ search: "" });
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Searches the whole retained window, ignoring the filters below.
              </p>
            </div>

            <div>
              <Label className="text-xs">Scope</Label>
              <Button
                variant={filters.bookingsOnly ? "default" : "outline"}
                size="sm"
                className="block"
                onClick={() => patch({ bookingsOnly: !filters.bookingsOnly })}
              >
                Bookings only
              </Button>
            </div>


            <div className="w-[190px]">
              <Label className="text-xs">Property</Label>
              <Select value={filters.propertyId} onValueChange={(v) => patch({ propertyId: v })}>
                <SelectTrigger>
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

            <div className="w-[190px]">
              <Label className="text-xs">Operation</Label>
              <Select value={filters.operation} onValueChange={(v) => patch({ operation: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All operations</SelectItem>
                  {operations.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-[170px]">
              <Label className="text-xs">Channel account</Label>
              <Select value={filters.ownerId} onValueChange={(v) => patch({ ownerId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {owners.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-[170px]">
              <Label className="text-xs">Direction</Label>
              <Select value={filters.direction} onValueChange={(v) => patch({ direction: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Both directions</SelectItem>
                  <SelectItem value="outbound">ROL'OS → channel</SelectItem>
                  <SelectItem value="inbound">Channel → ROL'OS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[210px]">
              <Label className="text-xs">Action</Label>
              <Select value={filters.action} onValueChange={(v) => patch({ action: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


            <div className="w-[150px]">
              <Label className="text-xs">Outcome</Label>
              <Select value={filters.outcome} onValueChange={(v) => patch({ outcome: v as RuApiLogFilters["outcome"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="success">Accepted</SelectItem>
                  <SelectItem value="failure">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[160px]">
              <Label className="text-xs">Window</Label>
              <Select value={String(filters.days)} onValueChange={(v) => patch({ days: Number(v) })}>
                <SelectTrigger>
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
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportFiltered} disabled={!rows.length}>
                <Download className="mr-2 h-4 w-4" />
                Export list
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              {stats.total} exchanges loaded
              {stats.totalCount != null ? ` of ${stats.totalCount} in window` : ""}
            </span>

            <span>{stats.failures} failed</span>
            <span>{stats.withResponseId} with ResponseID</span>
            <span>avg {stats.avgMs} ms</span>
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
              No exchanges match these filters.
            </p>
          ) : (
            <ScrollArea className="h-[560px] rounded-md border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs uppercase text-muted-foreground">
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
                      className="cursor-pointer border-t hover:bg-muted/40"
                      onClick={() => void openDetail(row)}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatTimestamp(row.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.action}</div>
                        {row.parent_action && (
                          <div className="text-xs text-muted-foreground">{row.parent_action}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {propertyNames.get(row.property_id ?? "") ??
                          row.ru_property_id ??
                          (row.ru_owner_id ? `Account ${row.ru_owner_id}` : "—")}

                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={row.success ? "secondary" : "destructive"}>
                          {row.success ? `OK ${row.status_id ?? ""}`.trim() : `Failed ${row.status_id ?? ""}`.trim()}
                        </Badge>
                        {row.error_message && (
                          <div className="max-w-[280px] truncate text-xs text-muted-foreground">
                            {row.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{row.response_id ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {row.elapsed_ms != null ? `${row.elapsed_ms} ms` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {formatBytes(row.request_bytes)} / {formatBytes(row.response_bytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasMore && (
                <div className="flex justify-center border-t p-3">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load older exchanges"}
                  </Button>
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
