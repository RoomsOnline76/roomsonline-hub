import { memo, useMemo } from "react";
import { seasonColor, type SeasonColorMap } from "@/lib/seasonColors";

/** One authored season rate row (plan-wide when `room_type_id` is null). */
export interface SeasonRateRow {
  rate_plan_id: string;
  room_type_id: string | null;
  base_rate: number | null;
  season_name: string | null;
}

export interface GridUnit {
  id: string;
  name: string;
}

/** Row height shared with the 7-night sample strip so the two grids line up. */
export const GRID_ROW_CLASS = "h-7";

const money = (n: number) => `R${Math.round(n).toLocaleString()}`;

/**
 * Season × unit price preview on a rate plan card.
 *
 * Units are stacked one per row (matching the sample calendar rows), seasons are
 * columns, and each cell shows the authored nightly rate. A plan-wide season rate
 * (no unit) applies to every unit; the plan base rate is the last fallback.
 */
export const RatePlanSeasonGrid = memo(function RatePlanSeasonGrid({
  units,
  rows,
  baseRate,
  seasonColors,
}: {
  units: GridUnit[];
  rows: SeasonRateRow[];
  baseRate: number | null;
  seasonColors?: SeasonColorMap;
}) {
  const { seasons, priceFor } = useMemo(() => {
    const order: string[] = [];
    const planWide = new Map<string, number>();
    const byUnit = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const name = row.season_name?.trim();
      const rate = Number(row.base_rate ?? 0);
      if (!name || !(rate > 0)) continue;
      if (!order.includes(name)) order.push(name);
      if (row.room_type_id) {
        const bucket = byUnit.get(row.room_type_id) ?? new Map<string, number>();
        bucket.set(name, rate);
        byUnit.set(row.room_type_id, bucket);
      } else if (!planWide.has(name)) {
        planWide.set(name, rate);
      }
    }
    const lookup = (unitId: string, season: string): number | null =>
      byUnit.get(unitId)?.get(season) ?? planWide.get(season) ?? null;
    return { seasons: order, priceFor: lookup };
  }, [rows]);

  if (units.length === 0) {
    return <p className="mt-2 text-xs italic text-muted-foreground/60">Not linked to any units</p>;
  }

  if (seasons.length === 0) {
    return (
      <div className="mt-2 overflow-hidden rounded-md border">
        <table className="w-full table-fixed border-collapse text-xs">
          <tbody>
            {units.map((u) => (
              <tr key={u.id} className={`border-t border-border/60 first:border-t-0 ${GRID_ROW_CLASS}`}>
                <td className="truncate px-2 font-medium" title={u.name}>{u.name}</td>
                <td className="px-2 text-right font-mono tabular-nums text-muted-foreground">
                  {baseRate && baseRate > 0 ? money(baseRate) : "Not priced"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="h-6 text-muted-foreground">
            <th className="w-28 px-2 text-left text-[10px] font-normal uppercase tracking-wide">Unit</th>
            {seasons.map((name) => {
              const color = seasonColor(name, seasonColors);
              return (
                <th
                  key={name}
                  title={`${name} season`}
                  className={`px-2 text-center text-[10px] font-medium uppercase tracking-wide ${color.tint} ${color.text}`}
                >
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} aria-hidden />
                    {name}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id} className={`border-t border-border/60 ${GRID_ROW_CLASS}`}>
              <td className="max-w-[7rem] truncate px-2 font-medium" title={u.name}>{u.name}</td>
              {seasons.map((name) => {
                const price = priceFor(u.id, name);
                const fallback = price === null && baseRate && baseRate > 0 ? baseRate : null;
                return (
                  <td
                    key={name}
                    title={`${u.name} · ${name}${price === null ? " (base fallback)" : ""}`}
                    className={`px-2 text-center font-mono tabular-nums ${seasonColor(name, seasonColors).tint} ${
                      price === null ? "text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {price !== null ? money(price) : fallback ? money(fallback) : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
