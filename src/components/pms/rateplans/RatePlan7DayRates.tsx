import { memo, useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { SA_PUBLIC_HOLIDAYS } from "@/lib/saPublicHolidays";
import { seasonColor } from "@/lib/seasonColors";

interface Day {
  date: string;
  price: number;
  source: string;
  season_name?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  daily_override: "Daily override",
  calendar_season: "Season",
  plan_season: "Season",
  relational_season: "Season",
  rack_rate: "Rack rate",
  unit_daily_rate: "Unit rate",
};

/** Prefer the authored season name; fall back to a friendly source label. */
const sourceLabel = (day: Day) =>
  day.season_name?.trim() || SOURCE_LABELS[day.source] || day.source;
interface Unit {
  room_type_id: string;
  name: string;
  days: Day[];
}

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

/**
 * Column tint: the season colour overlays the calendar tint, so seasons read at a
 * glance. Without a season, public holidays win over weekends; Sundays are lighter.
 */
const columnTint = (iso: string, season?: string) => {
  if (season) return seasonColor(season).tint;
  if (holidayName(iso)) return "bg-primary/15";
  if (isWeekend(iso)) return "bg-amber-500/20 dark:bg-amber-400/15";
  if (isSunday(iso)) return "bg-amber-500/10 dark:bg-amber-400/10";
  return "";
};
const short = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)));

/**
 * Very dense 7-night rate strip for a saved rate plan: one column per night,
 * one row per linked unit. Uses the production pricing engine, so these are the
 * numbers a guest is quoted right now.
 */
export const RatePlan7DayRates = memo(function RatePlan7DayRates({ ratePlanId }: { ratePlanId: string }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>(today);

  const jump = useCallback((days: number) => {
    setStartDate((prev) => addDays(prev, days));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.functions.invoke("rolos-rate-plans", {
        body: { action: "preview_plan", rate_plan_id: ratePlanId, window: { from: startDate, to: addDays(startDate, 6) } },
      });
      if (cancelled) return;
      setUnits(((data as { units?: Unit[] } | null)?.units ?? []).slice(0, 8));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ratePlanId, startDate]);

  if (loading) {
    return (
      <div className="flex w-[15.5rem] items-center justify-center rounded-md border bg-muted/30">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (units.length === 0) return null;

  const dates = units[0].days.slice(0, 7).map((d) => d.date);

  const isToday = startDate === today();

  /** Season per night (first unit that reports one) — drives the colour overlay. */
  const seasonByDate = new Map<string, string>();
  for (const d of dates) {
    for (const u of units) {
      const name = u.days.find((x) => x.date === d)?.season_name?.trim();
      if (name) {
        seasonByDate.set(d, name);
        break;
      }
    }
  }
  const seasonsInView = Array.from(new Set(dates.map((d) => seasonByDate.get(d)).filter(Boolean))) as string[];
  const hasFallbackNights = dates.some((d) => !seasonByDate.get(d));

  return (
    <div className="w-[15.5rem] shrink-0 overflow-hidden rounded-md border bg-muted/20">
      <div className="flex items-center justify-between border-b px-1.5 py-0.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {isToday ? "Next 7 nights" : `${new Date(`${startDate}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Back 1 month"
            onClick={() => jump(-28)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronsLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Back 1 week"
            onClick={() => jump(-7)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Forward 1 week"
            onClick={() => jump(7)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
          <button
            type="button"
            title="Forward 1 month"
            onClick={() => jump(28)}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronsRight className="h-3 w-3" />
          </button>
        </div>
      </div>
      <table className="w-full table-fixed border-collapse text-[10px] leading-[1.1]">
        <thead>
          <tr className="text-muted-foreground">
            <th className="w-14 px-1 py-0.5 text-left font-normal">Unit</th>
            {dates.map((d) => (
              <th
                key={d}
                title={[d, seasonByDate.get(d), holidayName(d)].filter(Boolean).join(" · ")}
                className={`px-0.5 py-0.5 text-center font-normal ${columnTint(d, seasonByDate.get(d))} ${
                  isWeekend(d) || isSunday(d) || holidayName(d) ? "text-foreground font-medium" : ""
                }`}
              >
                {dayLabel(d)}
                <span className="block text-[9px] opacity-70">{d.slice(8, 10)}</span>
                {holidayName(d) && (
                  <span className="mx-auto mt-px block h-1 w-1 rounded-full bg-primary" aria-hidden />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.room_type_id} className="border-t border-border/60">
              <td className="truncate px-1 py-0.5 font-medium" title={u.name}>
                {u.name}
              </td>
              {dates.map((d) => {
                const day = u.days.find((x) => x.date === d);
                return (
                  <td
                    key={d}
                    title={`${u.name} · ${d}${holidayName(d) ? ` · ${holidayName(d)}` : ""}${day ? ` · R${day.price.toLocaleString()} (${sourceLabel(day)})` : ""}`}
                    className={`px-0.5 py-0.5 text-center font-mono tabular-nums ${columnTint(d, seasonByDate.get(d))} ${
                      day?.source === "daily_override" ? "text-warning-foreground font-semibold" : ""
                    }`}
                  >
                    {day && day.price > 0 ? short(day.price) : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t px-1.5 py-0.5 text-[9px] text-muted-foreground">
        {seasonsInView.map((name) => (
          <span key={name} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-sm ${seasonColor(name).dot}`} aria-hidden />
            <span className="uppercase tracking-wide">{name}</span>
          </span>
        ))}
        {hasFallbackNights && (
          <>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-amber-500/40" aria-hidden /> Weekend
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-primary/40" aria-hidden /> Holiday
            </span>
            <span>Base rate fallback</span>
          </>
        )}
      </div>
    </div>
  );
});
