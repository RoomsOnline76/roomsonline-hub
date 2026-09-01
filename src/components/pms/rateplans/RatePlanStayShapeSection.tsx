/**
 * Length of stay and Full stay authoring for one rate plan.
 *
 * Daily is the parent product: both ladders are *derived* from the nightly amounts
 * typed in "Pricing by season". Nothing here changes what a guest is quoted or what a
 * channel receives yet — the book page and channel pushes stay nightly.
 */

import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  CalendarSeason,
  DerivationType,
  DraftAction,
  DraftFspCell,
  DraftLosRung,
  RatePlanDraft,
} from "./ratePlanDraft";
import { fspCellIsValid, losRungIsValid } from "./ratePlanDraft";
import { fspCellPreview, losRungPreview } from "./stayShapePreview";

interface Props {
  draft: RatePlanDraft;
  seasons: CalendarSeason[];
  dispatch: React.Dispatch<DraftAction>;
  /** Sentences from `ladderIssues` — rendered so the operator sees why Save is blocked. */
  issues: string[];
}

const OFFSET_TYPES: { value: DerivationType; label: string }[] = [
  { value: "percent", label: "% of daily" },
  { value: "amount", label: "Amount off/on" },
];

/** The season a new row should default to: the first one still sellable. */
const defaultSeasonId = (seasons: CalendarSeason[]): string => seasons[0]?.calendar_season_id ?? "";

export function RatePlanStayShapeSection({ draft, seasons, dispatch, issues }: Props) {
  const seasonName = useCallback(
    (id: string) => seasons.find((s) => s.calendar_season_id === id)?.name ?? "Season",
    [seasons],
  );

  const setFlag = useCallback(
    (key: "los_enabled" | "fsp_enabled", value: boolean) => dispatch({ type: "field", key, value }),
    [dispatch],
  );

  const seasonSelect = (value: string, onChange: (next: string) => void) => (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Season" />
      </SelectTrigger>
      <SelectContent>
        {seasons.map((s) => (
          <SelectItem key={s.calendar_season_id} value={s.calendar_season_id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const offsetSelect = (value: DerivationType, onChange: (next: DerivationType) => void) => (
    <Select value={value} onValueChange={(v) => onChange(v as DerivationType)}>
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OFFSET_TYPES.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const noSeasons = seasons.length === 0;

  return (
    <div className="space-y-6">
      {/* ── Length of stay ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="rp-los" className="text-sm font-medium">Length of stay (nightly by nights)</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Derived from the daily rate for this plan. Channels still see a nightly rate.
            </p>
          </div>
          <Switch
            id="rp-los"
            checked={draft.los_enabled}
            disabled={noSeasons}
            onCheckedChange={(v) => setFlag("los_enabled", v)}
          />
        </div>

        {draft.los_enabled && (
          <div className="space-y-2 rounded-md border p-3">
            {draft.los_rungs.length === 0 && (
              <p className="text-xs text-muted-foreground">No rungs yet — add the first nights threshold.</p>
            )}
            {draft.los_rungs.map((rung: DraftLosRung, index) => {
              const preview = losRungPreview(draft, rung, index);
              const invalid = !losRungIsValid(rung);
              return (
                <div key={`los-${index}`} className="space-y-1">
                  <div className="grid items-end gap-2 md:grid-cols-[1.4fr_0.8fr_1.1fr_0.8fr_auto_auto]">
                    {seasonSelect(rung.calendar_season_id, (v) =>
                      dispatch({ type: "patch_los_rung", index, patch: { calendar_season_id: v } }),
                    )}
                    <Input
                      className="h-9"
                      type="number"
                      min={1}
                      step={1}
                      value={rung.nights}
                      placeholder="Nights"
                      aria-label="From nights"
                      onChange={(e) => dispatch({ type: "patch_los_rung", index, patch: { nights: e.target.value } })}
                    />
                    {rung.is_pinned ? (
                      <Input
                        className="h-9 md:col-span-2"
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={rung.pinned_rate}
                        placeholder="Pinned nightly"
                        aria-label="Pinned nightly rate"
                        onChange={(e) =>
                          dispatch({ type: "patch_los_rung", index, patch: { pinned_rate: e.target.value } })
                        }
                      />
                    ) : (
                      <>
                        {offsetSelect(rung.derivation_type, (v) =>
                          dispatch({ type: "patch_los_rung", index, patch: { derivation_type: v } }),
                        )}
                        <Input
                          className="h-9"
                          type="number"
                          inputMode="decimal"
                          value={rung.derivation_value}
                          placeholder="-10"
                          aria-label="Offset"
                          onChange={(e) =>
                            dispatch({ type: "patch_los_rung", index, patch: { derivation_value: e.target.value } })
                          }
                        />
                      </>
                    )}
                    <label className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={rung.is_pinned}
                        onCheckedChange={(v) => dispatch({ type: "patch_los_rung", index, patch: { is_pinned: v } })}
                      />
                      Pin
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label="Remove rung"
                      onClick={() => dispatch({ type: "remove_los_rung", index })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className={`text-[11px] ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
                    {seasonName(rung.calendar_season_id)} ·{" "}
                    {preview.text ?? (invalid ? "incomplete row" : "unpriced — set the daily first")}
                  </p>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch({ type: "add_los_rung", calendarSeasonId: defaultSeasonId(seasons) })}
            >
              <Plus className="mr-2 h-4 w-4" /> Add rung
            </Button>
          </div>
        )}
      </div>

      {/* ── Full stay ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="rp-fsp" className="text-sm font-medium">Full stay (one price for the stay)</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Derived from the daily stay total. The book page still quotes nightly for now.
            </p>
          </div>
          <Switch
            id="rp-fsp"
            checked={draft.fsp_enabled}
            disabled={noSeasons}
            onCheckedChange={(v) => setFlag("fsp_enabled", v)}
          />
        </div>

        {draft.fsp_enabled && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Guests = adults + teens + children at quote time.
            </p>
            {draft.fsp_cells.map((cell: DraftFspCell, index) => {
              const preview = fspCellPreview(draft, cell, index);
              const invalid = !fspCellIsValid(cell);
              return (
                <div key={`fsp-${index}`} className="space-y-1">
                  <div className="grid items-end gap-2 md:grid-cols-[1.4fr_0.7fr_0.7fr_1.1fr_0.8fr_auto_auto]">
                    {seasonSelect(cell.calendar_season_id, (v) =>
                      dispatch({ type: "patch_fsp_cell", index, patch: { calendar_season_id: v } }),
                    )}
                    <Input
                      className="h-9"
                      type="number"
                      min={1}
                      step={1}
                      value={cell.nights}
                      placeholder="Nights"
                      aria-label="Nights"
                      onChange={(e) => dispatch({ type: "patch_fsp_cell", index, patch: { nights: e.target.value } })}
                    />
                    <Input
                      className="h-9"
                      type="number"
                      min={1}
                      step={1}
                      value={cell.nr_of_guests}
                      placeholder="Guests"
                      aria-label="Guests"
                      onChange={(e) =>
                        dispatch({ type: "patch_fsp_cell", index, patch: { nr_of_guests: e.target.value } })
                      }
                    />
                    {cell.is_pinned ? (
                      <Input
                        className="h-9 md:col-span-2"
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={cell.pinned_total}
                        placeholder="Pinned stay total"
                        aria-label="Pinned stay total"
                        onChange={(e) =>
                          dispatch({ type: "patch_fsp_cell", index, patch: { pinned_total: e.target.value } })
                        }
                      />
                    ) : (
                      <>
                        {offsetSelect(cell.derivation_type, (v) =>
                          dispatch({ type: "patch_fsp_cell", index, patch: { derivation_type: v } }),
                        )}
                        <Input
                          className="h-9"
                          type="number"
                          inputMode="decimal"
                          value={cell.derivation_value}
                          placeholder="-20"
                          aria-label="Offset"
                          onChange={(e) =>
                            dispatch({ type: "patch_fsp_cell", index, patch: { derivation_value: e.target.value } })
                          }
                        />
                      </>
                    )}
                    <label className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={cell.is_pinned}
                        onCheckedChange={(v) => dispatch({ type: "patch_fsp_cell", index, patch: { is_pinned: v } })}
                      />
                      Pin
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label="Remove cell"
                      onClick={() => dispatch({ type: "remove_fsp_cell", index })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className={`text-[11px] ${invalid ? "text-destructive" : "text-muted-foreground"}`}>
                    {seasonName(cell.calendar_season_id)} ·{" "}
                    {preview.text ?? (invalid ? "incomplete row" : "unpriced — set the daily first")}
                  </p>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch({ type: "add_fsp_cell", calendarSeasonId: defaultSeasonId(seasons) })}
            >
              <Plus className="mr-2 h-4 w-4" /> Add cell
            </Button>
          </div>
        )}
      </div>

      {noSeasons && (
        <p className="text-xs text-muted-foreground">
          Paint a season on the Calendar first — stay ladders are priced per season.
        </p>
      )}

      {issues.length > 0 && (
        <ul className="space-y-1 text-xs text-destructive">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
