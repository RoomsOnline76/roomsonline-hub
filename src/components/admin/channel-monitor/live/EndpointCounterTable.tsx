import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RU_ENDPOINT_CADENCE_LABELS,
  RU_ENDPOINT_FAMILY_LABELS,
  resolveRuEndpoint,
  type RuEndpointFamily,
} from "@/config/ruEndpointLibrary";
import type { RuEndpointCounter } from "@/hooks/useRuLiveTraffic";

/**
 * Every implemented endpoint with its 24-hour volume. Zero-volume rows stay visible on purpose:
 * a scheduled verb that has gone quiet is as much a defect as one that runs too often.
 */

const FAMILY_ORDER: RuEndpointFamily[] = [
  "ari",
  "bookings",
  "content",
  "account",
  "notifications",
  "discounts",
  "dictionary",
  "whitelabel",
];

interface Props {
  counters: RuEndpointCounter[];
}

export function EndpointCounterTable({ counters }: Props) {
  const [open, setOpen] = useState(true);
  const [hideIdle, setHideIdle] = useState(false);

  const grouped = useMemo(() => {
    const byFamily = new Map<RuEndpointFamily | "other", RuEndpointCounter[]>();
    for (const counter of counters) {
      if (hideIdle && counter.total === 0) continue;
      const key = counter.family ?? "other";
      const list = byFamily.get(key) ?? [];
      list.push(counter);
      byFamily.set(key, list);
    }
    const keys: (RuEndpointFamily | "other")[] = [...FAMILY_ORDER, "other"];
    return keys
      .filter((key) => (byFamily.get(key) ?? []).length > 0)
      .map((key) => ({
        key,
        label: key === "other" ? "Unregistered" : RU_ENDPOINT_FAMILY_LABELS[key],
        rows: (byFamily.get(key) ?? []).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
      }));
  }, [counters, hideIdle]);

  const totals = useMemo(
    () =>
      counters.reduce(
        (acc, c) => ({
          calls: acc.calls + c.total,
          failed: acc.failed + c.failed,
          deferred: acc.deferred + c.deferred,
        }),
        { calls: 0, failed: 0, deferred: 0 },
      ),
    [counters],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Endpoint counters (24 h)
          <Badge variant="outline">{totals.calls} calls</Badge>
          {totals.failed > 0 ? (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
              {totals.failed} failed
            </Badge>
          ) : null}
          {totals.deferred > 0 ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
              {totals.deferred} throttled
            </Badge>
          ) : null}
        </CollapsibleTrigger>
        <Button variant="ghost" size="sm" onClick={() => setHideIdle((v) => !v)}>
          {hideIdle ? "Show idle endpoints" : "Hide idle endpoints"}
        </Button>
      </div>

      <CollapsibleContent className="mt-2 space-y-4">
        {grouped.map((group) => (
          <div key={group.key} className="rounded-md border">
            <p className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Throttled</TableHead>
                  <TableHead className="text-right">Avg / p95</TableHead>
                  <TableHead className="text-right">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((row) => {
                  const spec = resolveRuEndpoint(row.action);
                  return (
                    <TableRow key={`${row.action}-${row.direction}`} className={row.total === 0 ? "opacity-60" : ""}>
                      <TableCell>
                        <p className="font-medium">{row.label}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{row.action}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {spec ? RU_ENDPOINT_CADENCE_LABELS[spec.cadence] : "unregistered"}
                        {spec?.mutating ? <Badge variant="outline" className="ml-2 text-[10px]">write</Badge> : null}
                      </TableCell>
                      <TableCell className="text-right font-medium">{row.total}</TableCell>
                      <TableCell className="text-right">
                        {row.failed > 0 ? <span className="text-destructive">{row.failed}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right">{row.deferred || "—"}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {row.total ? `${row.avgMs} / ${row.p95Ms} ms` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {row.lastAt ? `${formatDistanceToNow(new Date(row.lastAt))} ago` : "never"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
