import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RatePlanDraft } from "./ratePlanDraft";
import { draftToPayload } from "./ratePlanDraft";

interface PreviewDay {
  date: string;
  price: number;
  source: string;
}

interface PreviewUnit {
  room_type_id: string;
  name: string;
  days: PreviewDay[];
  stay: { min_stay: number; max_stay: number | null };
}

interface Props {
  propertyId: string;
  draft: RatePlanDraft;
}

const SOURCE_LABELS: Record<string, string> = {
  daily_override: "Calendar day override",
  calendar_season: "Season rate",
  plan_season: "Season rate",
  relational_season: "Stored season rate",
  rack_rate: "Base rate",
  unit_daily_rate: "Unit default rate",
};

const SOURCE_CLASSES: Record<string, string> = {
  daily_override: "bg-warning/15 text-warning-foreground border-warning-border",
  calendar_season: "bg-primary/15 text-foreground border-primary",
  plan_season: "bg-primary/15 text-foreground border-primary",
  relational_season: "bg-muted text-muted-foreground border-border",
  rack_rate: "bg-secondary text-secondary-foreground border-border",
  unit_daily_rate: "bg-muted text-muted-foreground border-border",
};

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Live preview of effective rates. It calls the same pure pricing engine the booking
 * engine and channel pushes use, so what is shown here is what a guest will be quoted
 * once the plan is saved.
 */
export function RatePlanEffectivePreview({ propertyId, draft }: Props) {
  const [units, setUnits] = useState<PreviewUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<number | null>(null);

  const window = useMemo(() => {
    const from = today();
    return { from, to: addDays(from, 29) };
  }, []);

  const payload = useMemo(() => draftToPayload(draft), [draft]);
  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);

  const run = useCallback(async () => {
    if (!propertyId || payload.units.length === 0) {
      setUnits([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("rolos-rate-plans", {
      body: { action: "preview", property_id: propertyId, draft: payload, window },
    });
    if (fnError || (data as { error?: string } | null)?.error) {
      setError((data as { error?: string } | null)?.error || fnError?.message || "Could not build the preview");
      setUnits([]);
    } else {
      setUnits(((data as { units?: PreviewUnit[] })?.units ?? []) as PreviewUnit[]);
    }
    setLoading(false);
  }, [propertyId, payload, window]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, 600) as unknown as number;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // payloadKey keeps the debounce keyed to real value changes, not object identity.
  }, [payloadKey, nonce, run]);

  // The engine can return the same physical unit more than once (duplicate room-type
  // rows or repeated links). Collapse them so each unit is previewed a single time.
  const visibleUnits = useMemo(() => {
    const seen = new Set<string>();
    const out: PreviewUnit[] = [];
    for (const unit of units) {
      const key = `${unit.room_type_id}|${(unit.name ?? "").trim().toLowerCase()}`;
      const nameKey = (unit.name ?? "").trim().toLowerCase();
      if (seen.has(key) || (nameKey && seen.has(nameKey))) continue;
      seen.add(key);
      if (nameKey) seen.add(nameKey);
      out.push(unit);
    }
    return out;
  }, [units]);

  const usedSources = useMemo(() => {
    const set = new Set<string>();
    for (const unit of visibleUnits) for (const day of unit.days) set.add(day.source);
    return [...set];
  }, [visibleUnits]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Next 30 nights, priced by the live booking engine. Unsaved changes are included.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setNonce((n) => n + 1)} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!error && visibleUnits.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">Link at least one unit to see effective rates.</p>
      )}

      <div className="space-y-4">
        {visibleUnits.map((unit) => (
          <div key={unit.room_type_id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{unit.name}</span>
              <Badge variant="outline" className="text-xs">Min {unit.stay.min_stay}n</Badge>
              {unit.stay.max_stay ? <Badge variant="outline" className="text-xs">Max {unit.stay.max_stay}n</Badge> : null}
              {unit.days.length < 30 && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {30 - unit.days.length} night{30 - unit.days.length === 1 ? "" : "s"} unpriced
                </Badge>
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {unit.days.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date} · ${SOURCE_LABELS[day.source] ?? day.source}`}
                  className={`min-w-[54px] shrink-0 rounded-md border px-1 py-1 text-center ${SOURCE_CLASSES[day.source] ?? "border-border bg-muted"}`}
                >
                  <div className="text-[10px] uppercase opacity-70">{day.date.slice(8, 10)}/{day.date.slice(5, 7)}</div>
                  <div className="text-xs font-semibold">R{Math.round(day.price).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {usedSources.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {usedSources.map((source) => (
            <span
              key={source}
              className={`rounded border px-2 py-0.5 text-[11px] ${SOURCE_CLASSES[source] ?? "border-border bg-muted"}`}
            >
              {SOURCE_LABELS[source] ?? source}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
