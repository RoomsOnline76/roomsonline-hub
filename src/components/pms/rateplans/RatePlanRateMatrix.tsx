import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react";
import { SA_PUBLIC_HOLIDAYS } from "@/lib/saPublicHolidays";
import { seasonColor, type SeasonColorMap } from "@/lib/seasonColors";
import type { GridUnit, SeasonRateRow } from "@/components/pms/rateplans/RatePlanSeasonGrid";

interface Day {
  date: string;
  price: number;
  source: string;
  season_name?: string;
}

interface PreviewUnit {
  room_type_id: string;
  name: string;
  days: Day[];
}

/** A plan in the comparison series. A single-element series renders as before. */
export interface MatrixPlan {
  id: string;
  name: string;
  baseRate?: number | null;
}

const SOURCE_LABELS: Record<string, string> = {
  daily_override: "Daily override",
  calendar_season: "Season",
  plan_season: "Season",
  relational_season: "Season",
  rack_rate: "Rack rate",
  unit_daily_rate: "Unit rate",
};

const sourceLabel = (day: Day) => day.season_name?.trim() || SOURCE_LABELS[day.source] || day.source;

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const dayLabel = (iso: string) => DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const isWeekend = (iso: string) => [5, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());
const isSunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;
const holidayName = (iso: string): string | null =>
  SA_PUBLIC_HOLIDAYS[Number(iso.slice(0, 4))]?.[iso] ?? null;

const columnTint = (iso: string, season?: string, colors?: SeasonColorMap) => {
  if (season) return seasonColor(season, colors).tint;
  if (holidayName(iso)) return "bg-primary/15";
  if (isWeekend(iso)) return "bg-amber-500/20 dark:bg-amber-400/15";
  if (isSunday(iso)) return "bg-amber-500/10 dark:bg-amber-400/10";
  return "";
};

const money = (n: number) => `R${Math.round(n).toLocaleString()}`;
const short = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)));

/** Row height for every unit row — grows to fit its content. */
const ROW_CLASS = "min-h-7";

/** Sample window: a full month of nights so the strip spans the card width. */
const NIGHTS = 30;

/**
 * Aligned rate matrix for a rate plan card. One row per linked unit for a single plan;
 * when several plans are compared, each unit grows one sub-row per plan so the authored
 * season prices and the live sample nights line up on the same nights.
 */
export const RatePlanRateMatrix = memo(function RatePlanRateMatrix({
  plans,
  units,
  rows,
  seasonColors,
}: {
  /** Plan series to render (1 = today's behaviour, 2+ = inline comparison). */
  plans: MatrixPlan[];
  /** Linked units in card order. */
  units: GridUnit[];
  /** Authored season rates for every plan in the series (carries `rate_plan_id`). */
  rows: SeasonRateRow[];
  seasonColors?: SeasonColorMap;
}) {
  const [preview, setPreview] = useState<Record<string, PreviewUnit[]>>({});
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>(today);

  const jump = useCallback((days: number) => setStartDate((prev) => addDays(prev, days)), []);

  const planIdsKey = useMemo(() => plans.map((p) => p.id).join(","), [plans]);
  const comparing = plans.length > 1;

  useEffect(() => {
    let cancelled = false;
    const ids = planIdsKey ? planIdsKey.split(",") : [];
    if (ids.length === 0) {
      setPreview({});
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const results = await Promise.all(
        ids.map(async (id) => {
          const { data } = await supabase.functions.invoke("rolos-rate-plans", {
            body: {
              action: "preview_plan",
              rate_plan_id: id,
              window: { from: startDate, to: addDays(startDate, NIGHTS - 1) },
            },
          });
          return [id, ((data as { units?: PreviewUnit[] } | null)?.units ?? []) as PreviewUnit[]] as const;
        }),
      );
      if (cancelled) return;
      setPreview(Object.fromEntries(results));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [planIdsKey, startDate]);

  /** Season order = union across compared plans; prices keyed by plan + unit. */
  const { seasons, priceFor } = useMemo(() => {
    const order: string[] = [];
    const planWide = new Map<string, number>(); // `${planId}|${season}`
    const byUnit = new Map<string, number>(); // `${planId}|${unitId}|${season}`
    for (const row of rows) {
      const name = row.season_name?.trim();
      const rate = Number(row.base_rate ?? 0);
      const planId = row.rate_plan_id ?? "";
      if (!name || !(rate > 0)) continue;
      if (!order.includes(name)) order.push(name);
      if (row.room_type_id) {
        byUnit.set(`${planId}|${row.room_type_id}|${name}`, rate);
      } else {
        const key = `${planId}|${name}`;
        if (!planWide.has(key)) planWide.set(key, rate);
      }
    }
    return {
      seasons: order,
      priceFor: (planId: string, unitId: string, season: string): number | null =>
        byUnit.get(`${planId}|${unitId}|${season}`) ?? planWide.get(`${planId}|${season}`) ?? null,
    };
  }, [rows]);

  /** Nightly rates keyed by plan, then unit, so each row picks up its own sample data. */
  const nightsByPlanUnit = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, Day>>>();
    for (const [planId, planUnits] of Object.entries(preview)) {
      const perUnit = new Map<string, Map<string, Day>>();
      for (const u of planUnits) {
        const bucket = new Map<string, Day>();
        for (const d of u.days) bucket.set(d.date, d);
        perUnit.set(u.room_type_id, bucket);
      }
      map.set(planId, perUnit);
    }
    return map;
  }, [preview]);

  const dates = useMemo(
    () => Array.from({ length: NIGHTS }, (_, i) => addDays(startDate, i)),
    [startDate],
  );

  const seasonByDate = useMemo(() => {
    const map = new Map<string, string>();
    const allUnits = Object.values(preview).flat();
    for (const d of dates) {
      for (const u of allUnits) {
        const name = u.days.find((x) => x.date === d)?.season_name?.trim();
        if (name) {
          map.set(d, name);
          break;
        }
      }
    }
    return map;
  }, [dates, preview]);

  /** Cheapest nightly price per unit+night across compared plans, for the highlight. */
  const cheapestByUnitDate = useMemo(() => {
    if (!comparing) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const plan of plans) {
      const perUnit = nightsByPlanUnit.get(plan.id);
      if (!perUnit) continue;
      for (const u of units) {
        for (const d of dates) {
          const price = perUnit.get(u.id)?.get(d)?.price;
          if (!price || price <= 0) continue;
          const key = `${u.id}|${d}`;
          const current = map.get(key);
          if (current === undefined || price < current) map.set(key, price);
        }
      }
    }
    return map;
  }, [comparing, plans, nightsByPlanUnit, units, dates]);

  if (units.length === 0) {
    return <p className="mt-2 text-xs italic text-muted-foreground/60">Not linked to any units</p>;
  }

  const isToday = startDate === today();

  return (
    <div className="mt-2 overflow-x-auto rounded-md border">
      <table className="w-full table-fixed border-collapse text-xs">
        <thead>
          {/* Group header: authored seasons on the left, sample-night navigation on the right. */}
          <tr className="h-6 border-b text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="w-20 px-1.5 text-left font-normal">Unit</th>
            {comparing && <th className="w-20 px-1.5 text-left font-normal">Plan</th>}
            {seasons.length > 0 && (
              <th colSpan={seasons.length} className="px-2 text-left font-medium">
                Rate by season
              </th>
            )}
            <th colSpan={NIGHTS} className="border-l-2 border-foreground/10 bg-muted/30 px-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium">
                  {isToday
                    ? `Next ${NIGHTS} nights`
                    : new Date(`${startDate}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <span className="flex items-center gap-0.5">
                  {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                  <button type="button" title="Back 1 month" onClick={() => jump(-28)} className="rounded p-0.5 hover:bg-muted hover:text-foreground">
                    <ChevronsLeft className="h-3 w-3" />
                  </button>
                  <button type="button" title="Back 1 week" onClick={() => jump(-7)} className="rounded p-0.5 hover:bg-muted hover:text-foreground">
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    title="Jump to today"
                    onClick={() => setStartDate(today())}
                    disabled={isToday}
                    className="rounded px-1 text-[9px] font-medium hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    Today
                  </button>
                  <button type="button" title="Forward 1 week" onClick={() => jump(7)} className="rounded p-0.5 hover:bg-muted hover:text-foreground">
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  <button type="button" title="Forward 1 month" onClick={() => jump(28)} className="rounded p-0.5 hover:bg-muted hover:text-foreground">
                    <ChevronsRight className="h-3 w-3" />
                  </button>
                </span>
              </div>
            </th>
          </tr>
          {/* Column header: season names, then each sample night. */}
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2" />
            {comparing && <th className="px-2" />}
            {seasons.map((name) => {
              const color = seasonColor(name, seasonColors);
              return (
                <th
                  key={name}
                  title={`${name} season`}
                  className={`w-14 px-1 text-center text-[9px] font-medium ${color.tint} ${color.text}`}
                >
                  <span className="inline-flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} aria-hidden />
                    {name}
                  </span>
                </th>
              );
            })}
            {dates.map((d, i) => (
              <th
                key={d}
                title={[d, d === today() ? "Today" : null, seasonByDate.get(d), holidayName(d)].filter(Boolean).join(" · ")}
                className={`px-0 py-0.5 text-center text-[9px] font-normal ${i === 0 ? "border-l-2 border-foreground/10 bg-muted/30" : ""} ${columnTint(d, seasonByDate.get(d), seasonColors)} ${
                  isWeekend(d) || isSunday(d) || holidayName(d) ? "font-medium text-foreground" : ""
                } ${d === today() ? "text-foreground ring-1 ring-inset ring-primary" : ""}`}
              >
                {d === today() ? (
                  <span className="block text-[8px] font-semibold text-primary">Today</span>
                ) : (
                  dayLabel(d)
                )}
                <span className="block text-[9px] leading-none opacity-70">{d.slice(8, 10)}</span>
                <span className="mt-px flex items-center justify-center gap-0.5">
                  {(isWeekend(d) || isSunday(d)) && <span className="block h-1 w-1 rounded-full bg-amber-500" aria-hidden />}
                  {holidayName(d) && <span className="block h-1 w-1 rounded-full bg-primary" aria-hidden />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((u) =>
            plans.map((plan, planIndex) => {
              const nights = nightsByPlanUnit.get(plan.id)?.get(u.id);
              const baseRate = plan.baseRate ?? null;
              return (
                <tr
                  key={`${u.id}|${plan.id}`}
                  className={`${planIndex === 0 ? "border-t border-border/60" : "border-t border-border/30"} ${ROW_CLASS}`}
                >
                  {planIndex === 0 && (
                    <td
                      rowSpan={plans.length}
                      className="max-w-[5rem] truncate px-1.5 align-middle text-[11px] font-medium"
                      title={u.name}
                    >
                      {u.name}
                    </td>
                  )}
                  {comparing && (
                    <td className="max-w-[5rem] truncate px-1.5 text-[10px] text-muted-foreground" title={plan.name}>
                      {plan.name}
                    </td>
                  )}
                  {seasons.map((name) => {
                    const price = priceFor(plan.id, u.id, name);
                    const fallback = price === null && baseRate && baseRate > 0 ? baseRate : null;
                    return (
                      <td
                        key={name}
                        title={`${u.name} · ${plan.name} · ${name}${price === null ? " (base fallback)" : ""}`}
                        className={`px-1 text-center font-mono text-[10px] tabular-nums ${seasonColor(name, seasonColors).tint} ${
                          price === null ? "text-muted-foreground" : "text-foreground"
                        }`}
                      >
                        {price !== null ? money(price) : fallback ? money(fallback) : "–"}
                      </td>
                    );
                  })}
                  {dates.map((d, i) => {
                    const day = nights?.get(d);
                    const cheapest =
                      comparing && day && day.price > 0 && cheapestByUnitDate.get(`${u.id}|${d}`) === day.price;
                    return (
                      <td
                        key={d}
                        title={`${u.name} · ${plan.name} · ${d}${holidayName(d) ? ` · ${holidayName(d)}` : ""}${day ? ` · R${day.price.toLocaleString()} (${sourceLabel(day)})` : ""}${cheapest ? " · cheapest of compared plans" : ""}`}
                        className={`px-0 text-center font-mono text-[9px] leading-none tabular-nums ${i === 0 ? "border-l-2 border-foreground/10 bg-muted/20" : ""} ${columnTint(d, seasonByDate.get(d), seasonColors)} ${
                          day?.source === "daily_override" ? "font-semibold text-warning-foreground" : ""
                        } ${cheapest ? "font-semibold text-primary underline decoration-primary/50" : ""}`}
                      >
                        {day && day.price > 0 ? short(day.price) : loading ? "" : "–"}
                      </td>
                    );
                  })}
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
});
