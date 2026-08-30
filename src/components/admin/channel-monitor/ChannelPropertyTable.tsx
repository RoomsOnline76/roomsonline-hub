import { Fragment, useEffect, useRef, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Archive, RotateCcw, Search, Play, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEur, formatZar } from "@/lib/channelBillingForecast";
import type { ChannelPropertyRow, ChannelSyncState, ChannelUnitRow, FxRate } from "@/hooks/useChannelCostMonitor";
import { cn } from "@/lib/utils";

interface Props {
  rows: ChannelPropertyRow[];
  fx: FxRate | null;
  busyPropertyId: string | null;
  busyUnitId?: string | null;
  onArchive: (row: ChannelPropertyRow) => void;
  onReactivate: (row: ChannelPropertyRow) => void;
  onToggleUnit: (row: ChannelPropertyRow, unit: ChannelUnitRow, activate: boolean) => void;
  /** Remove one duplicate listing (or all of them when unit is omitted) from the channel manager. */
  onPurgeDuplicate: (row: ChannelPropertyRow, unit?: ChannelUnitRow) => void;
}

const STATE_LABELS: Record<ChannelSyncState, string> = {
  live: "Live",
  paused: "Paused",
  archived: "Archived",
  pending: "Never pushed",
};

export function ChannelPropertyTable({
  rows,
  fx,
  busyPropertyId,
  busyUnitId,
  onArchive,
  onReactivate,
  onToggleUnit,
  onPurgeDuplicate,
}: Props) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | ChannelSyncState>("all");
  const [portfolioFilter, setPortfolioFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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
      if (
        term &&
        !r.name.toLowerCase().includes(term) &&
        !(r.portfolioName || "").toLowerCase().includes(term) &&
        !r.id.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, search, stateFilter, portfolioFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, ChannelPropertyRow[]>();
    for (const r of filtered) {
      // Unassigned properties (no portfolio) stand alone — the listing is for
      // that single property only, so they get no group header at all.
      if (!r.portfolioName) continue;
      const list = map.get(r.portfolioName);
      if (list) list.push(r);
      else map.set(r.portfolioName, [r]);
    }
    return Array.from(map.entries())
      .map(([name, groupRows]) => ({
        name,
        rows: [...groupRows].sort((a, b) => a.name.localeCompare(b.name)),
        listings: groupRows.reduce((sum, r) => sum + r.listings, 0),
        duplicates: groupRows.reduce((sum, r) => sum + r.duplicateListings, 0),
        monthlyCostEur: groupRows.reduce((sum, r) => sum + r.monthlyCostEur, 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const unassignedRows = useMemo(
    () => filtered.filter((r) => !r.portfolioName).sort((a, b) => a.name.localeCompare(b.name)),
    [filtered],
  );

  // Portfolios collapse by default: seed the collapsed set with every group
  // name once, the first time groups are computed, so the table renders compact.
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current && groups.length > 0) {
      didInit.current = true;
      setCollapsed(new Set(groups.map((g) => g.name)));
    }
  }, [groups]);

  const toggleGroup = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const renderPropertyRow = (row: ChannelPropertyRow) => {
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
          <TableCell>
            <div className="font-medium">{row.name}</div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
              {row.ownerId && (
                <span className="font-mono" title="Channel sub-account ID">
                  Sub-account: {row.ownerId}
                </span>
              )}
              {row.ownerEmail && (
                <span title="Channel sub-account portal login">
                  {row.ownerEmail}
                </span>
              )}
              {row.subUserId && row.subUserId !== row.ownerId && (
                <span className="font-mono" title="Channel sub-user ID">
                  User: {row.subUserId}
                </span>
              )}
              {!row.ownerId && !row.subUserId && (
                <span className="italic">No channel account linked</span>
              )}
            </div>
          </TableCell>
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
          <TableCell className="text-right tabular-nums">
            {row.duplicateListings > 0 ? (
              <span className="font-medium text-destructive">{row.duplicateListings}</span>
            ) : (
              <span className="text-muted-foreground">0</span>
            )}
          </TableCell>
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
            {row.state === "live" ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onArchive(row)}>
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                Archive
              </Button>
            ) : (
              <div className="flex justify-end gap-1.5">
                <Button size="sm" disabled={busy} onClick={() => onReactivate(row)}>
                  {row.state === "paused" ? (
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {busy ? "Activating…" : "Activate & sync"}
                </Button>
                {row.state === "paused" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onArchive(row)}>
                    <Archive className="mr-1.5 h-3.5 w-3.5" />
                    Archive
                  </Button>
                )}
              </div>
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
                        <Badge variant="default" className="h-4 px-1.5 text-[9px]">
                          Billing
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px]"
                          disabled={busyUnitId === u.id}
                          title="Removes the channel listing and stops it billing. A unit still listed on the property's Rooms tab stays active and sellable in ROL'OS."
                          onClick={() => onToggleUnit(row, u, false)}
                        >
                          <Archive className="mr-1 h-3 w-3" />
                          Delist from channel
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {row.duplicates.length > 0 && (
                <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-medium text-destructive">
                      {row.duplicates.length} duplicate listing{row.duplicates.length === 1 ? "" : "s"} still
                      exist at the channel manager — these are deleted units and can still bill.
                    </p>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-[10px]"
                      disabled={busy}
                      onClick={() => onPurgeDuplicate(row)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Remove all duplicates
                    </Button>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {row.duplicates.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground">{u.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground">{u.listingId}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive"
                            disabled={busyUnitId === u.id || busy}
                            onClick={() => onPurgeDuplicate(row, u)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Remove from channel
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
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
  };

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
              placeholder="Search property, portfolio or ID"
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
              <SelectItem value="pending">Never pushed</SelectItem>
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
              <TableHead className="text-right">Duplicates</TableHead>
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

            {groups.map((group) => {
              const groupOpen = !collapsed.has(group.name);
              return (
              <Fragment key={`group-${group.name}`}>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableCell className="pr-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => toggleGroup(group.name)}
                      aria-label={groupOpen ? `Collapse ${group.name}` : `Expand ${group.name}`}
                    >
                      {groupOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                  <TableCell colSpan={3}>
                    <span className="text-xs font-semibold uppercase tracking-wide">{group.name}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {group.rows.length} propert{group.rows.length === 1 ? "y" : "ies"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">{group.listings}</TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">
                    {group.duplicates > 0 ? (
                      <span className="text-destructive">{group.duplicates}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">
                    {formatEur(group.monthlyCostEur)}
                    {fx && (
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {formatZar(group.monthlyCostEur * fx.eurToZar)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>

                {groupOpen && group.rows.map(renderPropertyRow)}
              </Fragment>
              );
            })}

            {unassignedRows.map(renderPropertyRow)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
