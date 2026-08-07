import { memo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CalendarDays, ChevronsRight, Wand2 } from "lucide-react";
import type {
  CalendarSeason,
  DraftSeasonRate,
  LiveSeasonMatrix,
  RatePlanDraft,
  SeasonPricingMode,
} from "./ratePlanDraft";
import { seasonRateFor, seasonUnitRate } from "./ratePlanDraft";

interface RoomTypeOption {
  id: string;
  name: string;
}

interface Props {
  draft: RatePlanDraft;
  seasons: CalendarSeason[];
  roomTypes: RoomTypeOption[];
  /** Rates the live booking engine resolves today, per season per unit. */
  liveMatrix?: LiveSeasonMatrix;
  liveMatrixLoading?: boolean;
  onChange: (calendarSeasonId: string, patch: Partial<DraftSeasonRate>) => void;
  onCellChange: (calendarSeasonId: string, roomTypeId: string, value: string) => void;
  onFillColumn: (calendarSeasonId: string, value: string) => void;
  onFillRow: (roomTypeId: string, sourceCalendarSeasonId: string) => void;
  /** Pull live rates into the matrix. Omit the season id to seed every season. */
  onSeedFromLive: (calendarSeasonId?: string) => void;
}

const fmtRange = (season: CalendarSeason) =>
  season.periods
    .map((p) => `${p.from.slice(8, 10)}/${p.from.slice(5, 7)} – ${p.to.slice(8, 10)}/${p.to.slice(5, 7)}`)
    .join(", ");

const fmtMoney = (n: number) => `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;


/**
 * Pricing by Season — a unit (rows) x Calendar season (columns) matrix.
 * Seasons come from the Calendar and are read-only here; this table only prices them.
 */
export const RatePlanSeasonPricingTable = memo(function RatePlanSeasonPricingTable({
  draft,
  seasons,
  roomTypes,
  liveMatrix,
  liveMatrixLoading,
  onChange,
  onCellChange,
  onFillColumn,
  onFillRow,
  onSeedFromLive,
}: Props) {
  const setMode = useCallback(
    (calendarSeasonId: string, mode: SeasonPricingMode) => onChange(calendarSeasonId, { mode }),
    [onChange],
  );

  const linkedUnits = roomTypes.filter((rt) => draft.units.some((u) => u.room_type_id === rt.id));
  const planBase = Number(draft.base_rate);
  const hasLive = !!liveMatrix && [...liveMatrix.values()].some((m) => m.size > 0);

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

  if (linkedUnits.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Link at least one unit to this plan (section 4) — units become the rows of this pricing table.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-[46rem] text-xs text-muted-foreground">
          Rows are the units this plan sells, columns are the seasons the Calendar painted (read-only). Type a nightly
          rate into any cell — the season switches to <strong>Fixed rate</strong> automatically. Use{" "}
          <strong>Difference</strong> to price off the plan base rate, or <strong>Not priced</strong> to fall back to it.
        </p>
        {hasLive && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 gap-1.5 text-xs"
            disabled={liveMatrixLoading}
            onClick={() => onSeedFromLive()}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Bring in live rates
          </Button>
        )}
      </div>


      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sticky left-0 z-10 min-w-[180px] bg-muted/50 p-2 text-left align-top text-xs font-medium">
                Unit
              </th>
              {seasons.map((season) => {
                const rate = seasonRateFor(draft, season.calendar_season_id);
                const live = liveMatrix?.get(season.calendar_season_id);
                return (
                  <th
                    key={season.calendar_season_id}
                    className={`min-w-[170px] border-l p-2 text-left align-top ${rate.mode === "none" ? "opacity-70" : ""}`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold">{season.name}</span>
                        {season.min_stay ? (
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">{season.min_stay}n</Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-[10px] font-normal text-muted-foreground">{fmtRange(season)}</p>

                      <ToggleGroup
                        type="single"
                        size="sm"
                        variant="outline"
                        aria-label={`How ${season.name} is priced`}
                        value={rate.mode}
                        onValueChange={(v) => v && setMode(season.calendar_season_id, v as SeasonPricingMode)}
                        className="justify-start"
                      >
                        <ToggleGroupItem value="none" className="h-6 px-1.5 text-[10px]">Not priced</ToggleGroupItem>
                        <ToggleGroupItem value="absolute" className="h-6 px-1.5 text-[10px]">Fixed</ToggleGroupItem>
                        <ToggleGroupItem value="differential" className="h-6 px-1.5 text-[10px]">Diff</ToggleGroupItem>
                      </ToggleGroup>

                      {rate.mode === "differential" && (
                        <ToggleGroup
                          type="single"
                          size="sm"
                          variant="outline"
                          value={rate.differential_type}
                          onValueChange={(v) =>
                            v && onChange(season.calendar_season_id, { differential_type: v as "amount" | "percent" })
                          }
                          className="justify-start"
                        >
                          <ToggleGroupItem value="amount" className="h-6 px-2 text-[10px]">R</ToggleGroupItem>
                          <ToggleGroupItem value="percent" className="h-6 px-2 text-[10px]">%</ToggleGroupItem>
                        </ToggleGroup>
                      )}

                      {rate.mode !== "none" && (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            inputMode="decimal"
                            className="h-7 text-xs"
                            placeholder="All units"
                            value={rate.mode === "differential" ? rate.differential_value : rate.base_rate}
                            onChange={(e) =>
                              onChange(
                                season.calendar_season_id,
                                rate.mode === "differential"
                                  ? { differential_value: e.target.value }
                                  : { base_rate: e.target.value },
                              )
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-1.5 text-[10px]"
                            title="Apply this value to every unit"
                            onClick={() =>
                              onFillColumn(
                                season.calendar_season_id,
                                rate.mode === "differential" ? rate.differential_value : rate.base_rate,
                              )
                            }
                          >
                            Fill
                          </Button>
                        </div>
                      )}

                      {(liveMatrix?.get(season.calendar_season_id)?.size ?? 0) > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-5 gap-1 px-1.5 text-[10px] font-normal"
                          title="Fill this season's cells with the rates the live booking engine uses today"
                          onClick={() => onSeedFromLive(season.calendar_season_id)}
                        >
                          <Wand2 className="h-3 w-3" />
                          Use live rates
                        </Button>
                      )}

                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {linkedUnits.map((rt) => (
              <tr key={rt.id} className="border-b last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 max-w-[220px] truncate bg-background p-2 text-left text-xs font-medium"
                >
                  <span className="flex items-center gap-1">
                    <span className="truncate">{rt.name}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 p-0"
                      title="Copy this unit's first priced value across all priced seasons"
                      onClick={() => onFillRow(rt.id, seasons[0]?.calendar_season_id ?? "")}
                    >
                      <ChevronsRight className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </th>
                {seasons.map((season) => {
                  const rate = seasonRateFor(draft, season.calendar_season_id);
                  const disabled = rate.mode === "none";
                  const inherited = rate.mode === "differential" ? rate.differential_value : rate.base_rate;
                  return (
                    <td key={season.calendar_season_id} className="border-l p-1.5 align-middle">
                      {disabled ? (
                        <p className="px-1 text-[10px] italic text-muted-foreground">Base rate</p>
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-7 text-xs"
                          aria-label={`${rt.name} — ${season.name}`}
                          placeholder={inherited ? inherited : rate.mode === "differential" ? "0" : "Rate"}
                          value={seasonUnitRate(rate, rt.id)}
                          onChange={(e) => onCellChange(season.calendar_season_id, rt.id, e.target.value)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        An empty cell inherits the season's "all units" value, then the plan base rate.
      </p>
    </div>
  );
});
