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
import { seasonRateFor, seasonUnitRate, pricingNoun } from "./ratePlanDraft";
import { seasonColor, type SeasonColorMap } from "@/lib/seasonColors";

interface RoomTypeOption {
  id: string;
  name: string;
}

interface Props {
  draft: RatePlanDraft;
  seasons: CalendarSeason[];
  /** Season name -> Calendar-authored colour, so columns match the Calendar. */
  seasonColors?: SeasonColorMap;
  roomTypes: RoomTypeOption[];
  /** Legacy Calendar-authored rates, per season per unit — import source only. */
  liveMatrix?: LiveSeasonMatrix;
  liveMatrixLoading?: boolean;
  /** Calendar season id -> unit ids still priced only by the legacy Calendar grid. */
  legacyPendingBySeason?: Map<string, Set<string>>;
  /** Total cells waiting on the legacy import. Zero hides every import affordance. */
  legacyPendingCells?: number;
  onChange: (calendarSeasonId: string, patch: Partial<DraftSeasonRate>) => void;
  onCellChange: (calendarSeasonId: string, roomTypeId: string, value: string) => void;
  onFillColumn: (calendarSeasonId: string, value: string) => void;
  onFillRow: (roomTypeId: string, sourceCalendarSeasonId: string) => void;
  /** Import legacy Calendar rates into the matrix. Omit the season id for every season. */
  onSeedFromLive: (calendarSeasonId?: string) => void;
}

const todayISO = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
};

const fmtWindow = (p: { from: string; to: string }) =>
  `${p.from.slice(8, 10)}/${p.from.slice(5, 7)} – ${p.to.slice(8, 10)}/${p.to.slice(5, 7)}`;

/**
 * Only the windows that can still be sold (today or later), oldest first.
 * Historical windows stay in the data but are never shown here.
 */
const upcomingWindows = (season: CalendarSeason) => {
  const today = todayISO();
  return season.periods
    .filter((p) => p?.from && p?.to && String(p.to) >= today)
    .map((p) => ({ from: String(p.from), to: String(p.to) }))
    .sort((a, b) => a.from.localeCompare(b.from));
};

const fmtMoney = (n: number) => `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;



/**
 * Pricing by Season — a unit (rows) x Calendar season (columns) matrix.
 * Seasons come from the Calendar and are read-only here; this table only prices them.
 */
export const RatePlanSeasonPricingTable = memo(function RatePlanSeasonPricingTable({
  draft,
  seasons,
  seasonColors,
  roomTypes,
  liveMatrix,
  liveMatrixLoading,
  legacyPendingBySeason,
  legacyPendingCells = 0,
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
  const noun = pricingNoun(draft.pricing_model);
  const planBase = Number(draft.base_rate);
  const hasLegacyPending = legacyPendingCells > 0;

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
          Link at least one {noun.singular} to this plan (section 4) — {noun.plural} become the rows of this pricing
          table.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-[46rem] text-xs text-muted-foreground">
          Rows are the {noun.plural} this plan sells, columns are the seasons the Calendar painted (read-only). Type a nightly
          rate into any cell — the season switches to <strong>Fixed rate</strong> automatically. Use{" "}
          <strong>Difference</strong> to price off the plan base rate, or <strong>Not priced</strong> to fall back to it.
          This is the only place nightly rates are captured; the Calendar sets season dates only.
        </p>
      </div>

      {hasLegacyPending && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="max-w-[40rem] text-xs text-foreground">
            <strong>{legacyPendingCells}</strong> {noun.singular}/season rate{legacyPendingCells === 1 ? "" : "s"} on this plan still
            live only in the old Calendar grid. Move them here so Rate Plans holds every price. Cells you have already
            priced are left untouched, and nothing is committed until you save.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 gap-1.5 text-xs"
            disabled={liveMatrixLoading}
            onClick={() => onSeedFromLive()}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Move these rates into this plan
          </Button>
        </div>
      )}


      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sticky left-0 z-10 min-w-[180px] bg-muted/50 p-2 text-left align-top text-xs font-medium">
                {noun.Singular}
              </th>
              {seasons.map((season) => {
                const rate = seasonRateFor(draft, season.calendar_season_id);
                const windows = upcomingWindows(season);
                const shown = windows.slice(0, 2);
                const extra = windows.length - shown.length;
                const colour = seasonColor(season.name, seasonColors);
                return (
                  <th
                    key={season.calendar_season_id}
                    className={`w-[190px] min-w-[190px] max-w-[190px] border-l p-2 text-left align-top ${colour.tint} ${rate.mode === "none" ? "opacity-70" : ""}`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 shrink-0 rounded-sm ${colour.dot}`} aria-hidden />
                        <span className={`truncate text-xs font-semibold ${colour.text}`}>{season.name}</span>
                        {season.min_stay ? (
                          <Badge variant="outline" className="px-1 py-0 text-[10px]">{season.min_stay}n</Badge>
                        ) : null}
                      </div>

                      {windows.length > 0 ? (
                        <div
                          className="space-y-0.5 text-[10px] font-normal leading-tight text-muted-foreground"
                          title={windows.map(fmtWindow).join(", ")}
                        >
                          {shown.map((w) => (
                            <p key={`${w.from}-${w.to}`} className="truncate">{fmtWindow(w)}</p>
                          ))}
                          {extra > 0 && <p className="truncate">+{extra} more window{extra > 1 ? "s" : ""}</p>}
                        </div>
                      ) : (
                        <p className="truncate text-[10px] font-normal text-muted-foreground">No upcoming dates</p>
                      )}


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
                        {isDerivedPlan ? (
                          <ToggleGroupItem value="derived" className="h-6 px-1.5 text-[10px]" title="Track the parent plan with an offset">
                            Tracked
                          </ToggleGroupItem>
                        ) : (
                          <ToggleGroupItem value="differential" className="h-6 px-1.5 text-[10px]">Diff</ToggleGroupItem>
                        )}
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

                      {rate.mode === "derived" ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-7 text-xs"
                          placeholder={`Offset (${derivationSuffix})`}
                          title="This season's offset off the parent plan. Blank follows the plan offset."
                          value={rate.derivation_value ?? ""}
                          onChange={(e) => onChange(season.calendar_season_id, { derivation_value: e.target.value })}
                        />
                      ) : rate.mode !== "none" ? (
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
                      ) : null}


                      {(legacyPendingBySeason?.get(season.calendar_season_id)?.size ?? 0) > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-5 gap-1 px-1.5 text-[10px] font-normal"
                          title="Copy the legacy Calendar rates for this season into its cells"
                          onClick={() => onSeedFromLive(season.calendar_season_id)}
                        >
                          <Wand2 className="h-3 w-3" />
                          Import legacy
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
                  const columnValue = rate.mode === "differential" ? rate.differential_value : rate.base_rate;
                  const liveValue = liveMatrix?.get(season.calendar_season_id)?.get(rt.id);
                  // What this cell resolves to while it is empty, best hint first.
                  const fallback =
                    columnValue !== ""
                      ? columnValue
                      : rate.mode === "differential"
                        ? "0"
                        : liveValue && liveValue > 0
                          ? `${fmtMoney(liveValue)} legacy`
                          : planBase > 0
                            ? `${fmtMoney(planBase)} base`
                            : "Rate";
                  return (
                    <td key={season.calendar_season_id} className="border-l p-1.5 align-middle">
                      <Input
                        type="number"
                        inputMode="decimal"
                        className={`h-7 text-xs ${rate.mode === "none" ? "border-dashed" : ""}`}
                        aria-label={`${rt.name} — ${season.name}`}
                        placeholder={fallback}
                        value={seasonUnitRate(rate, rt.id)}
                        onChange={(e) => onCellChange(season.calendar_season_id, rt.id, e.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        An empty cell inherits the season's "all units" value, then the plan base rate. "legacy" shows what the booking
        engine currently quotes for that unit and season.
      </p>

    </div>
  );
});
