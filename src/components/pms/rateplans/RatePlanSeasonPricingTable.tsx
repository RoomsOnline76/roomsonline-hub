import { memo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CalendarDays } from "lucide-react";
import type { CalendarSeason, DraftSeasonRate, RatePlanDraft, SeasonPricingMode } from "./ratePlanDraft";
import { seasonRateFor } from "./ratePlanDraft";

interface Props {
  draft: RatePlanDraft;
  seasons: CalendarSeason[];
  onChange: (calendarSeasonId: string, patch: Partial<DraftSeasonRate>) => void;
}

const fmtRange = (season: CalendarSeason) =>
  season.periods
    .map((p) => `${p.from.slice(8, 10)}/${p.from.slice(5, 7)} – ${p.to.slice(8, 10)}/${p.to.slice(5, 7)}`)
    .join(", ");

/**
 * Pricing by Season. The rows are driven entirely by the seasons the Calendar paints —
 * this table prices them and never edits their names or dates.
 */
export const RatePlanSeasonPricingTable = memo(function RatePlanSeasonPricingTable({
  draft,
  seasons,
  onChange,
}: Props) {
  const setMode = useCallback(
    (calendarSeasonId: string, mode: SeasonPricingMode) => onChange(calendarSeasonId, { mode }),
    [onChange],
  );

  if (seasons.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center">
        <CalendarDays className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No seasons have been painted on the Calendar yet. Seasons are created in the Calendar; once they exist they
          appear here for pricing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Seasons and their dates come from the Calendar and are read-only here. Price each season with a fixed nightly
        rate, or as a difference off this plan's base rate.
      </p>
      <div className="divide-y rounded-md border">
        {seasons.map((season) => {
          const rate = seasonRateFor(draft, season.calendar_season_id);
          return (
            <div
              key={season.calendar_season_id}
              className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,220px)] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{season.name}</span>
                  {season.min_stay ? (
                    <Badge variant="outline" className="text-xs">Min {season.min_stay}n</Badge>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">{fmtRange(season)}</p>
              </div>

              <ToggleGroup
                type="single"
                size="sm"
                value={rate.mode}
                onValueChange={(v) => v && setMode(season.calendar_season_id, v as SeasonPricingMode)}
              >
                <ToggleGroupItem value="none" className="text-xs">Not priced</ToggleGroupItem>
                <ToggleGroupItem value="absolute" className="text-xs">Fixed rate</ToggleGroupItem>
                <ToggleGroupItem value="differential" className="text-xs">Difference</ToggleGroupItem>
              </ToggleGroup>

              <div>
                {rate.mode === "absolute" && (
                  <div>
                    <Label className="sr-only">Nightly rate for {season.name}</Label>
                    <Input
                      type="number"
                      min={0}
                      inputMode="decimal"
                      placeholder="Nightly rate"
                      value={rate.base_rate}
                      onChange={(e) => onChange(season.calendar_season_id, { base_rate: e.target.value })}
                    />
                  </div>
                )}
                {rate.mode === "differential" && (
                  <div className="flex items-center gap-2">
                    <ToggleGroup
                      type="single"
                      size="sm"
                      value={rate.differential_type}
                      onValueChange={(v) =>
                        v && onChange(season.calendar_season_id, { differential_type: v as "amount" | "percent" })
                      }
                    >
                      <ToggleGroupItem value="amount" className="text-xs">R</ToggleGroupItem>
                      <ToggleGroupItem value="percent" className="text-xs">%</ToggleGroupItem>
                    </ToggleGroup>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder={rate.differential_type === "percent" ? "e.g. 15" : "e.g. 250"}
                      value={rate.differential_value}
                      onChange={(e) => onChange(season.calendar_season_id, { differential_value: e.target.value })}
                    />
                  </div>
                )}
                {rate.mode === "none" && (
                  <p className="text-xs italic text-muted-foreground">Falls back to the base rate</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
