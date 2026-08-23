import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ReportSnapshot } from "@/hooks/useReportSnapshot";
import { monthLabel } from "@/lib/historicalBaseline";

const money = (value: number): string =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const percent = (value: number): string => `${((value || 0) * 100).toFixed(1)}%`;

const signedMoney = (value: number): string =>
  `${value > 0 ? "+" : ""}${money(value)}`;

const varianceTone = (value: number): string =>
  value > 0 ? "text-primary" : value < 0 ? "text-destructive" : "text-muted-foreground";

const sumMap = (map: Record<string, number>, months: string[]): number =>
  months.reduce((total, key) => total + (map[key] ?? 0), 0);

interface Props {
  snapshot: ReportSnapshot;
  /** Window months with no parsed data — printed as dashes, not zeros. */
  missingMonths?: string[];
}

/** Month-by-month view of the computed snapshot with previous / last-year comparison. */
export function SnapshotTable({ snapshot, missingMonths = [] }: Props) {
  const sources = useMemo(
    () =>
      Object.entries(snapshot.sourceBreakdown ?? {})
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0)),
    [snapshot.sourceBreakdown],
  );

  const comparisonTotals = useMemo(() => {
    const months = snapshot.months;
    const previous = sumMap(snapshot.previousOtbRevenue, months);
    const lastYear = sumMap(snapshot.lastYearActual, months);
    const current = sumMap(snapshot.otbRevenue, months);
    return { previous, lastYear, variance: current - previous, lyVariance: current - lastYear };
  }, [snapshot]);

  const missing = useMemo(() => new Set(missingMonths), [missingMonths]);
  const nonSellableRows = snapshot.totals.non_sellable_rows ?? 0;
  const hasComparison =
    Object.keys(snapshot.previousOtbRevenue).length > 0 ||
    Object.keys(snapshot.lastYearActual).length > 0;

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Month</th>
              <th className="py-2 px-3 font-medium text-right">OTB revenue</th>
              <th className="py-2 px-3 font-medium text-right">Previous OTB</th>
              <th className="py-2 px-3 font-medium text-right">Variance</th>
              <th className="py-2 px-3 font-medium text-right">Last year</th>
              <th className="py-2 px-3 font-medium text-right">Room nights</th>
              <th className="py-2 px-3 font-medium text-right">Capacity days</th>
              <th className="py-2 px-3 font-medium text-right">ADR</th>
              <th className="py-2 pl-3 font-medium text-right">Occupancy</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.months.map((key) => {
              const current = snapshot.otbRevenue[key] ?? 0;
              const previous = snapshot.previousOtbRevenue[key] ?? 0;
              const variance = current - previous;
              const percentChange = previous === 0 ? null : variance / previous;
              if (missing.has(key)) {
                return (
                  <tr key={key} className="border-b last:border-0 text-muted-foreground">
                    <td className="py-2 pr-3 font-medium">{monthLabel(key)}</td>
                    <td className="py-2 px-3 text-right" colSpan={8}>
                      No source file uploaded for this month
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={key} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{monthLabel(key)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{money(current)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                    {money(previous)}
                  </td>
                  <td className={cn("py-2 px-3 text-right tabular-nums", varianceTone(variance))}>
                    {signedMoney(variance)}
                    {percentChange !== null && (
                      <span className="block text-xs">{percent(percentChange)}</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                    {money(snapshot.lastYearActual[key] ?? 0)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {snapshot.roomNights[key] ?? 0}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                    {snapshot.capacityDays[key] ?? 0}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{money(snapshot.adr[key] ?? 0)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">
                    {percent(snapshot.occupancy[key] ?? 0)}
                  </td>
                </tr>
              );
            })}
            <tr className="font-medium">
              <td className="py-2 pr-3">Total</td>
              <td className="py-2 px-3 text-right tabular-nums">
                {money(snapshot.totals.revenue ?? 0)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                {money(comparisonTotals.previous)}
              </td>
              <td
                className={cn(
                  "py-2 px-3 text-right tabular-nums",
                  varianceTone(comparisonTotals.variance),
                )}
              >
                {signedMoney(comparisonTotals.variance)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                {money(comparisonTotals.lastYear)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums">{snapshot.totals.nights ?? 0}</td>
              <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">
                {snapshot.totals.capacity_days ?? 0}
              </td>
              <td className="py-2 px-3 text-right tabular-nums">{money(snapshot.totals.adr ?? 0)}</td>
              <td className="py-2 pl-3 text-right tabular-nums">
                {percent(snapshot.totals.occupancy ?? 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!hasComparison && (
        <p className="text-xs text-muted-foreground">
          No comparison data yet — pick a baseline run and capture last-year actuals in the property
          settings to fill the previous and last-year columns.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Source breakdown</p>
          {sources.length === 0 && <p className="text-sm text-muted-foreground">No sources.</p>}
          {sources.map((source) => (
            <div key={source.name} className="flex items-center justify-between text-sm">
              <span>{source.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {money(source.revenue ?? 0)} · {source.nights ?? 0} nights
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Excluded rows</p>
          {nonSellableRows === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Room 0 / Holding in Credit / Events rows found.
            </p>
          ) : (
            <>
              <p className="text-sm">
                {nonSellableRows} non-sellable row(s) kept out of occupancy.
              </p>
              {Object.entries(snapshot.nonSellable ?? {}).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span>{monthLabel(key)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {money(value.revenue ?? 0)} · {value.nights ?? 0} nights
                  </span>
                </div>
              ))}
            </>
          )}
          <p className="text-xs text-muted-foreground pt-2">
            Capacity based on {snapshot.roomCount ?? "?"} room(s).
          </p>
        </div>
      </div>
    </div>
  );
}
