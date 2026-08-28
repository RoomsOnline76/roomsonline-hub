import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { monthLabel } from "@/lib/historicalBaseline";

export type ExcludedReason =
  | "blocked_zero_revenue"
  | "unavailable"
  | "room_zero"
  | "event"
  | "holding_credit"
  | "excluded_by_rule";

const REASON_LABELS: Record<ExcludedReason, string> = {
  blocked_zero_revenue: "Zero revenue (block / maintenance / owner)",
  unavailable: "Unavailable (room out of order)",
  room_zero: "Room 0",
  event: "Events",
  holding_credit: "Holding in credit",
  excluded_by_rule: "Excluded by property rule",
};


export interface ExcludedRow {
  booking_id: string;
  arrival: string;
  nights: number;
  revenue: number;
  room_name: string;
  guest_name: string;
  company: string;
  source: string;
  reason: ExcludedReason;
  matched: string | null;
}

export interface ExcludedRowsPayload {
  months?: Record<string, ExcludedRow[]> | null;
  kept_zero_revenue?: {
    rows: number;
    nights: number;
    patterns?: Record<string, number> | null;
  } | null;
}

interface Props {
  excludedRows: ExcludedRowsPayload | null | undefined;
}

const money = (value: number): string =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value || 0);

/**
 * Every ledger row the parser set aside, so a reviewer can confirm nothing real
 * was filtered out — and see which zero-revenue rows the keep-list rescued.
 */
export function ExcludedRowsCard({ excludedRows }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const months = useMemo(() => {
    const byMonth = excludedRows?.months ?? {};
    return Object.keys(byMonth)
      .filter((key) => (byMonth[key]?.length ?? 0) > 0)
      .sort();
  }, [excludedRows]);

  const kept = excludedRows?.kept_zero_revenue ?? null;
  const keptPatterns = Object.entries(kept?.patterns ?? {});

  const totalRows = useMemo(
    () =>
      months.reduce((sum, key) => sum + (excludedRows?.months?.[key]?.length ?? 0), 0),
    [months, excludedRows],
  );

  if (months.length === 0 && !kept?.rows) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">
          Rows set aside{totalRows > 0 ? ` (${totalRows})` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          These rows are excluded from revenue, room nights, ADR and occupancy. Blocks,
          maintenance, owner stays and unavailable rooms usually export at 0.00.
        </p>

        {kept?.rows ? (
          <div className="rounded-md border border-dashed p-3 text-xs">
            <span className="font-medium">{kept.rows} zero-revenue row(s)</span> kept as real
            nights ({kept.nights} room night(s)) by this property&apos;s keep-list.
            {keptPatterns.length > 0 && (
              <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                {keptPatterns.map(([pattern, count]) => (
                  <Badge key={pattern} variant="secondary">
                    {pattern} × {count}
                  </Badge>
                ))}
              </span>
            )}
          </div>
        ) : null}

        {months.map((key) => {
          const rows = excludedRows?.months?.[key] ?? [];
          const isOpen = open[key] ?? false;
          return (
            <div key={key} className="rounded-md border">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-between px-3 py-2 h-auto"
                onClick={() => setOpen((prev) => ({ ...prev, [key]: !isOpen }))}
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {monthLabel(key)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {rows.length} row(s) · {rows.reduce((sum, row) => sum + row.nights, 0)} night(s)
                </span>
              </Button>
              {isOpen && (
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left">
                        <th>Arrival</th>
                        <th>Room</th>
                        <th>Guest / company</th>
                        <th>Source</th>
                        <th className="text-right">Nights</th>
                        <th className="text-right">Revenue</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, index) => (
                        <tr
                          key={`${row.booking_id}-${index}`}
                          className="border-t [&>td]:px-3 [&>td]:py-1.5"
                        >
                          <td className="whitespace-nowrap">{row.arrival}</td>
                          <td>{row.room_name || "—"}</td>
                          <td>{[row.guest_name, row.company].filter(Boolean).join(" · ") || "—"}</td>
                          <td>{row.source || "—"}</td>
                          <td className="text-right tabular-nums">{row.nights}</td>
                          <td className="text-right tabular-nums">{money(row.revenue)}</td>
                          <td>
                            <Badge variant="outline">
                              {REASON_LABELS[row.reason] ?? row.reason}
                              {row.matched ? `: ${row.matched}` : ""}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
