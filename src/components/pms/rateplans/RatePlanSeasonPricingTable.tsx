import { memo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CalendarDays, Wand2 } from "lucide-react";
import type { CalendarSeason, DraftSeasonRate, RatePlanDraft, SeasonPricingMode } from "./ratePlanDraft";
import { seasonRateFor } from "./ratePlanDraft";

interface Props {
  draft: RatePlanDraft;
  seasons: CalendarSeason[];
  /** Nightly rates already captured on the Calendar for this plan, per calendar season id. */
  legacySeasonRates?: Map<string, number[]>;
  onChange: (calendarSeasonId: string, patch: Partial<DraftSeasonRate>) => void;
}

const fmtRange = (season: CalendarSeason) =>
  season.periods
    .map((p) => `${p.from.slice(8, 10)}/${p.from.slice(5, 7)} – ${p.to.slice(8, 10)}/${p.to.slice(5, 7)}`)
    .join(", ");

const fmtMoney = (n: number) => `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;

/**
 * Pricing by Season. The rows are driven entirely by the seasons the Calendar paints —
 * this table prices them and never edits their names or dates.
 */
export const RatePlanSeasonPricingTable = memo(function RatePlanSeasonPricingTable({
  draft,
  seasons,
  legacySeasonRates,
  onChange,
}: Props) {
  const setMode = useCallback(
    (calendarSeasonId: string, mode: SeasonPricingMode) => onChange(calendarSeasonId, { mode }),
    [onChange],
  );
  const applyRate = useCallback(
    (calendarSeasonId: string, amount: number) =>
      onChange(calendarSeasonId, { mode: "absolute", base_rate: String(amount) }),
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
        Seasons and their dates come from the Calendar and are read-only here. For each season choose{" "}
        <strong>Fixed rate</strong> and enter the nightly rate, or <strong>Difference</strong> to price it off this
        plan's base rate. <strong>Not priced</strong> means the season simply uses the base rate.
      </p>
      <div className="divide-y rounded-md border">
        {seasons.map((season) => {
          const rate = seasonRateFor(draft, season.calendar_season_id);
          const suggestions = legacySeasonRates?.get(season.calendar_season_id) ?? [];
          return (
            <div key={season.calendar_season_id} className="space-y-2 p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,220px)] md:items-center">
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
                  variant="outline"
                  aria-label={`How ${season.name} is priced`}
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
                        autoFocus={rate.base_rate === ""}
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
                        variant="outline"
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

              {suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 md:pl-1">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Wand2 className="h-3 w-3" />
                    Already on the Calendar for this season:
                  </span>
                  {suggestions.map((amount) => (
                    <Button
                      key={amount}
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-6 px-2 text-xs"
                      onClick={() => applyRate(season.calendar_season_id, amount)}
                    >
                      Use {fmtMoney(amount)}
                    </Button>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    (unit-specific amounts stay as per-unit differences below)
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
