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
  type DerivationType,
  type DraftFspCell,
  type DraftLosRung,
  type RatePlanDraft,
} from "./ratePlanDraft";

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Same shape as the engine's `applyDerivation`. */
export function applyOffset(
  amount: number,
  type: DerivationType,
  value: number,
  rounding: string,
): number {
  const raw = type === "percent" ? amount * (1 + value / 100) : amount + value;
  const next = rounding === "none" ? round2(raw) : Math.round(raw / 10) * 10;
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

/** One line per LOS rung: what the derived nightly comes to. */
export function losRungPreview(draft: RatePlanDraft, rung: DraftLosRung, index: number): LadderPreviewLine {
  const key = `los-${index}`;
  if (!losRungIsValid(rung)) return { key, text: null };
  if (rung.is_pinned) return { key, text: `Pinned at R${Number(rung.pinned_rate).toLocaleString()} / night from ${rung.nights} nights` };
  const nightly = draftSeasonNightly(draft, rung.calendar_season_id);
  if (nightly === null) return { key, text: null };
  const derived = applyOffset(nightly, rung.derivation_type, Number(rung.derivation_value), draft.derivation_rounding);
  return {
    key,
    text: `From ${rung.nights} nights: R${nightly.toLocaleString()} → R${derived.toLocaleString()} / night`,
  };
}

/** One line per full-stay cell: what the derived stay total comes to. */
export function fspCellPreview(draft: RatePlanDraft, cell: DraftFspCell, index: number): LadderPreviewLine {
  const key = `fsp-${index}`;
  if (!fspCellIsValid(cell)) return { key, text: null };
  const nights = Number(cell.nights);
  const guests = Number(cell.nr_of_guests);
  if (cell.is_pinned) {
    const total = Number(cell.pinned_total);
    return {
      key,
      text: `${nights} nights, ${guests} guest${guests === 1 ? "" : "s"}: pinned at R${total.toLocaleString()} (R${Math.round(total / nights).toLocaleString()} / night)`,
    };
  }
  const nightly = draftSeasonNightly(draft, cell.calendar_season_id);
  if (nightly === null) return { key, text: null };
  const daily = stayTotal(draft.pricing_model, nightly, nights, guests);
  if (daily <= 0) return { key, text: null };
  const derived = applyOffset(daily, cell.derivation_type, Number(cell.derivation_value), draft.derivation_rounding);
  return {
    key,
    text: `${nights} nights, ${guests} guest${guests === 1 ? "" : "s"}: R${daily.toLocaleString()} → R${derived.toLocaleString()} for the stay`,
  };
}
