/**
 * Client mirror of the stay-shape math in `supabase/functions/_shared/ratePricing.ts`
 * (`stayQuote` / `stayTotalForModel`) — keep both in step.
 *
 * This exists only so the Rate Plan editor can show what a rung or cell will do to the
 * daily amount already typed in the draft. It never invents a price: with no daily
 * amount for the season it returns null and the editor says "unpriced".
 */

import {
  canonicalPricingModel,
  fspCellIsValid,
  losRungIsValid,
  seasonRateFor,
  type CalendarSeason,
  type DerivationType,
  type DraftFspCell,
  type DraftLosRung,
  type RatePlanDraft,
} from "./ratePlanDraft";


const round2 = (v: number) => Math.round(v * 100) / 100;

/** Same shape as the engine's `applyDerivation` (rounds up to the next 10). */
export function applyOffset(
  amount: number,
  type: DerivationType,
  value: number,
  rounding: string,
): number {
  const raw = type === "percent" ? amount * (1 + value / 100) : amount + value;
  const next = rounding === "none" ? round2(raw) : Math.ceil(raw / 10) * 10;
  return next > 0 ? next : 0;
}

/**
 * The daily nightly this draft prices for a season: the column amount, else the
 * lowest cell typed for a linked unit. Null when the season is not priced yet.
 */
export function draftSeasonNightly(draft: RatePlanDraft, calendarSeasonId: string): number | null {
  const rate = seasonRateFor(draft, calendarSeasonId);
  if (rate.mode === "none") return null;
  const candidates: number[] = [];
  const base = Number(rate.base_rate);
  if (rate.base_rate !== "" && Number.isFinite(base) && base > 0) candidates.push(base);
  for (const unit of draft.units) {
    const cell = Number(rate.unit_rates[unit.room_type_id] ?? "");
    if (Number.isFinite(cell) && cell > 0) candidates.push(cell);
  }
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

/** Mirror of `stayTotalForModel` for a flat nightly series. */
export function stayTotal(pricingModel: string, nightly: number, nights: number, guests: number): number {
  const model = canonicalPricingModel(pricingModel);
  if (nights < 1 || nightly <= 0) return 0;
  if (model === "per_room" || model === "per_unit") return nightly * nights;
  if (model === "per_person") return nightly * Math.max(1, guests) * nights;
  // per_person_sharing: the nightly covers two guests, extras at half.
  const extra = Math.max(0, guests - 2);
  return (nightly + extra * (nightly / 2)) * nights;
}

export interface LadderPreviewLine {
  key: string;
  /** Null when the season has no daily amount to derive from. */
  text: string | null;
}

/** The season the Calendar paints over a given date, if any. */
export function seasonCoveringDate(seasons: CalendarSeason[], date: string): CalendarSeason | null {
  if (!date) return null;
  for (const season of seasons || []) {
    for (const period of season.periods || []) {
      if (period?.from && period?.to && date >= period.from && date <= period.to) return season;
    }
  }
  return null;
}

/**
 * The nightly a ladder row derives from: its own season, or — for a dated window —
 * the season covering the window's first night.
 */
function nightlyForRow(
  draft: RatePlanDraft,
  row: { scope: "season" | "dates"; calendar_season_id: string; start_date: string },
  seasons: CalendarSeason[],
): number | null {
  if (row.scope !== "dates") return draftSeasonNightly(draft, row.calendar_season_id);
  const season = seasonCoveringDate(seasons, row.start_date);
  return season ? draftSeasonNightly(draft, season.calendar_season_id) : null;
}

/** Appended to every dated row that also carries an advisory minimum stay. */
function minStaySuffix(row: { scope: "season" | "dates"; min_stay_nights: string }): string {
  if (row.scope !== "dates") return "";
  const n = Number(row.min_stay_nights);
  return Number.isFinite(n) && n >= 1 ? ` · minimum ${n} night${n === 1 ? "" : "s"}` : "";
}

/** One line per LOS rung: what the derived nightly comes to. */
export function losRungPreview(
  draft: RatePlanDraft,
  rung: DraftLosRung,
  index: number,
  seasons: CalendarSeason[] = [],
): LadderPreviewLine {
  const key = `los-${index}`;
  if (!losRungIsValid(rung)) return { key, text: null };
  const suffix = minStaySuffix(rung);
  if (rung.is_pinned) {
    return {
      key,
      text: `Pinned at R${Number(rung.pinned_rate).toLocaleString()} / night from ${rung.nights} nights${suffix}`,
    };
  }
  const nightly = nightlyForRow(draft, rung, seasons);
  if (nightly === null) return { key, text: suffix ? `Unpriced${suffix}` : null };
  const derived = applyOffset(nightly, rung.derivation_type, Number(rung.derivation_value), draft.derivation_rounding);
  return {
    key,
    text: `From ${rung.nights} nights: R${nightly.toLocaleString()} → R${derived.toLocaleString()} / night${suffix}`,
  };
}

/** One line per full-stay cell: what the derived stay total comes to. */
export function fspCellPreview(
  draft: RatePlanDraft,
  cell: DraftFspCell,
  index: number,
  seasons: CalendarSeason[] = [],
): LadderPreviewLine {
  const key = `fsp-${index}`;
  if (!fspCellIsValid(cell)) return { key, text: null };
  const nights = Number(cell.nights);
  const guests = Number(cell.nr_of_guests);
  const suffix = minStaySuffix(cell);
  if (cell.is_pinned) {
    const total = Number(cell.pinned_total);
    return {
      key,
      text: `${nights} nights, ${guests} guest${guests === 1 ? "" : "s"}: pinned at R${total.toLocaleString()} (R${Math.round(total / nights).toLocaleString()} / night)${suffix}`,
    };
  }
  const nightly = nightlyForRow(draft, cell, seasons);
  if (nightly === null) return { key, text: suffix ? `Unpriced${suffix}` : null };
  const daily = stayTotal(draft.pricing_model, nightly, nights, guests);
  if (daily <= 0) return { key, text: null };
  const derived = applyOffset(daily, cell.derivation_type, Number(cell.derivation_value), draft.derivation_rounding);
  return {
    key,
    text: `${nights} nights, ${guests} guest${guests === 1 ? "" : "s"}: R${daily.toLocaleString()} → R${derived.toLocaleString()} for the stay${suffix}`,
  };
}

