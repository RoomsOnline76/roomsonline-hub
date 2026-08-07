import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { useRevenueMix } from "@/hooks/useRevenueStreamTotals";
import { RevenueMixTable } from "./RevenueMixTable";

const money = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;
const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "0%");

interface Props {
  dateRange: { start: string; end: string };
  propertyIds: string[];
  /** Optional label describing the period, shown in the header. */
  periodLabel?: string;
  className?: string;
}

/**
 * Revenue Mix — Accommodation / Food & Beverage / Other split for the period,
 * with a per-property breakdown and portfolio total.
 *
 * Reads posted folio revenue only. When nothing in scope posts F&B the panel
 * explains how to switch the split on rather than showing empty figures.
 */
export function RevenueMixPanel({ dateRange, propertyIds, periodLabel, className }: Props) {
  const { data, isLoading } = useRevenueMix(dateRange, propertyIds);

  const segments = [
    { key: "accommodation", label: "Accommodation", value: data?.accommodation || 0, className: "bg-foreground" },
    { key: "fnb", label: "Food & Beverage", value: data?.fnb || 0, className: "bg-primary" },
    { key: "other", label: "Other", value: data?.other || 0, className: "bg-muted-foreground" },
  ];

  return (
    <Card className={className}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <PieChart className="h-4 w-4 text-primary" />
          Revenue mix
        </CardTitle>
        {periodLabel && <span className="text-xs text-muted-foreground">{periodLabel}</span>}
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !data || data.total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No posted revenue in this period yet.
          </p>
        ) : !data.hasSplit ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              All {money(data.total)} of posted revenue is recorded as accommodation — no F&B split is
              configured yet. Set breakfast (value and basis) on a{" "}
              <Link to="/rolos/rate-plans" className="text-primary underline underline-offset-2">
                rate plan
              </Link>{" "}
              and ROL'OS will separate the streams automatically from the next posting.
            </p>
          </div>
        ) : (
          <>
            {/* Stacked share bar */}
            <div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                {segments.map((s) =>
                  s.value > 0 ? (
                    <div
                      key={s.key}
                      className={s.className}
                      style={{ width: `${(s.value / data.total) * 100}%` }}
                      title={`${s.label}: ${money(s.value)}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {segments.map((s) => (
                  <div key={s.key}>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-sm ${s.className}`} />
                      <span className="text-[11px] text-muted-foreground truncate">{s.label}</span>
                    </div>
                    <p className="text-base font-semibold tabular-nums leading-tight">{money(s.value)}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {pct(s.value, data.total)} of revenue
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-3">
              <RevenueMixTable
                rows={data.byProperty}
                totals={{
                  accommodation: data.accommodation,
                  fnb: data.fnb,
                  other: data.other,
                  total: data.total,
                  accomAdr: data.accomAdr,
                }}
                compact={data.byProperty.length <= 1}
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Accom ADR is accommodation revenue per booked room night — F&B excluded.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
