import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Archive, RotateCcw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEur, formatZar } from "@/lib/channelBillingForecast";
import type { ChannelPropertyRow, ChannelSyncState, FxRate } from "@/hooks/useChannelCostMonitor";
import { cn } from "@/lib/utils";

interface Props {
  rows: ChannelPropertyRow[];
  fx: FxRate | null;
  busyPropertyId: string | null;
  onArchive: (row: ChannelPropertyRow) => void;
  onReactivate: (row: ChannelPropertyRow) => void;
}

const STATE_LABELS: Record<ChannelSyncState, string> = {
  live: "Live",
  paused: "Paused",
  archived: "Archived",
};

export function ChannelPropertyTable({ rows, fx, busyPropertyId, onArchive, onReactivate }: Props) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | ChannelSyncState>("all");
  const [portfolioFilter, setPortfolioFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const portfolios = useMemo(
    () => Array.from(new Set(rows.map((r) => r.portfolioName).filter((n): n is string => !!n))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateFilter !== "all" && r.state !== stateFilter) return false;
      if (portfolioFilter !== "all" && r.portfolioName !== portfolioFilter) return false;
      if (term && !r.name.toLowerCase().includes(term) && !(r.portfolioName || "").toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [rows, search, stateFilter, portfolioFilter]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-sm font-semibold">
          Properties on the Channel Manager
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {filtered.length} of {rows.length}
          </span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search property or portfolio"
              className="h-8 w-56 pl-7 text-xs"
            />
          </div>
          <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as typeof stateFilter)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All portfolios</SelectItem>
              {portfolios.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Property</TableHead>
              <TableHead>Portfolio</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Listings</TableHead>
              <TableHead className="text-right">Archived units</TableHead>
              <TableHead className="text-right">Monthly cost</TableHead>
              <TableHead>Last push</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No properties match these filters.
                </TableCell>
              </TableRow>
            )}

            {filtered.map((row) => {
              const open = expanded === row.id;
              const busy = busyPropertyId === row.id;
              return (
                <Fragment key={row.id}>
                  <TableRow className={cn(row.state === "archived" && "opacity-70")}>
                    <TableCell className="pr-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setExpanded(open ? null : row.id)}
                        aria-label={open ? "Hide units" : "Show units"}
                      >
                        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.portfolioName || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.state === "live" ? "default" : row.state === "paused" ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {STATE_LABELS[row.state]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.listings}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{row.archivedUnits}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEur(row.monthlyCostEur)}
                      {fx && (
                        <span className="block text-[10px] text-muted-foreground">
                          {formatZar(row.monthlyCostEur * fx.eurToZar)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastPushAt ? new Date(row.lastPushAt).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.state === "archived" ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => onReactivate(row)}>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Re-activate
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => onArchive(row)}>
                          <Archive className="mr-1.5 h-3.5 w-3.5" />
                          Archive
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>

                  {open && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell />
                      <TableCell colSpan={8} className="py-3">
                        {row.units.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Building-level listing{" "}
                            <span className="font-mono">{row.buildingListingId || "not listed"}</span> — no unit rows.
                          </p>
                        ) : (
                          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                            {row.units.map((u) => (
                              <div key={u.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate">{u.name}</span>
                                <span className="flex items-center gap-2">
                                  <span className="font-mono text-muted-foreground">{u.listingId}</span>
                                  <Badge
                                    variant={u.isActive ? "default" : "outline"}
                                    className="h-4 px-1.5 text-[9px]"
                                  >
                                    {u.isActive ? "Billing" : "Inactive"}
                                  </Badge>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {row.archivedAt && (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Archived {new Date(row.archivedAt).toLocaleString()}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
