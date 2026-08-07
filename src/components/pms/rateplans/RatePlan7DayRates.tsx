import { memo, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Day {
  date: string;
  price: number;
  source: string;
}
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
const isWeekend = (iso: string) => [0, 5, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());
const short = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)));

/**
 * Very dense 7-night rate strip for a saved rate plan: one column per night,
 * one row per linked unit. Uses the production pricing engine, so these are the
 * numbers a guest is quoted right now.
 */
export const RatePlan7DayRates = memo(function RatePlan7DayRates({ ratePlanId }: { ratePlanId: string }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const from = today();
    (async () => {
      setLoading(true);
      const { data } = await supabase.functions.invoke("rolos-rate-plans", {
        body: { action: "preview_plan", rate_plan_id: ratePlanId, window: { from, to: addDays(from, 6) } },
      });
      if (cancelled) return;
      setUnits(((data as { units?: Unit[] } | null)?.units ?? []).slice(0, 8));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ratePlanId]);

  if (loading) {
    return (
      <div className="flex w-[15.5rem] items-center justify-center rounded-md border bg-muted/30">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (units.length === 0) return null;

  const dates = units[0].days.slice(0, 7).map((d) => d.date);

  return (
    <div className="w-[15.5rem] shrink-0 overflow-hidden rounded-md border bg-muted/20">
      <div className="border-b px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Next 7 nights
      </div>
      <table className="w-full table-fixed border-collapse text-[10px] leading-[1.1]">
        <thead>
          <tr className="text-muted-foreground">
            <th className="w-14 px-1 py-0.5 text-left font-normal">Unit</th>
            {dates.map((d) => (
              <th
                key={d}
                title={d}
                className={`px-0.5 py-0.5 text-center font-normal ${isWeekend(d) ? "text-foreground" : ""}`}
              >
                {dayLabel(d)}
                <span className="block text-[9px] opacity-70">{d.slice(8, 10)}</span>
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
                    title={day ? `${u.name} · ${d} · R${day.price.toLocaleString()} (${day.source})` : d}
                    className={`px-0.5 py-0.5 text-center font-mono tabular-nums ${
                      isWeekend(d) ? "bg-muted/60" : ""
                    } ${day?.source === "daily_override" ? "text-warning-foreground font-semibold" : ""}`}
                  >
                    {day && day.price > 0 ? short(day.price) : "–"}
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
