/**
 * Full Stay Pricing matrix → channel `<FSPSeasons>`.
 *
 * Pure. One season per priced night; `DefaultPrice` is the parent nightly resolved by the rate
 * resolver, and each cell is a STAY TOTAL for a nights x guests combination — derived from that
 * parent, or a pin. No new pricing model, no long-stay percent specials.
 *
 * `<FSPSeasons>` and `<Season>` are mutually exclusive on one PutPrices body, so the caller picks
 * exactly one form per unit.
 */

import { applyDerivation, type FspCell } from "./ratePricing.ts";
import { windowCoversRung } from "./ruLosPricing.ts";

export type RuFspPriceCell = { nr_of_nights: number; price: number };
export type RuFspRow = { nr_of_guests: number; prices: RuFspPriceCell[] };
export type RuFspSeason = { date: string; default_price: number; rows: RuFspRow[] };

function unitScoped(cellUnit: string | null | undefined, unitRolosId: string | null): boolean {
  const scoped = cellUnit ? String(cellUnit) : "";
  if (!scoped) return true;
  return Boolean(unitRolosId) && scoped === unitRolosId;
}

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function fspSeasonForNight(opts: {
  date: string;
  parentNightly: number;
  cells: FspCell[];
  calendarSeasonId: string | null;
  unitRolosId: string | null;
  rounding?: string | null;
}): RuFspSeason | null {
  const { date, parentNightly, cells, calendarSeasonId, unitRolosId, rounding } = opts;
  const parent = positive(parentNightly);
  // An unpriced night never becomes a Full Stay season — the caller aborts on incomplete coverage.
  if (parent === null) return null;

  // guests -> nights -> { price, pinned }
  const rows = new Map<number, Map<number, { price: number; pinned: boolean }>>();

  for (const cell of Array.isArray(cells) ? cells : []) {
    const nights = Number(cell?.nights);
    const guests = Number(cell?.nr_of_guests);
    if (!Number.isFinite(nights) || nights < 1) continue;
    if (!Number.isFinite(guests) || guests < 1) continue;
    if (!unitScoped(cell?.room_type_id, unitRolosId)) continue;
    if (!windowCoversRung(cell, date, date, calendarSeasonId)) continue;

    const total = cell.is_pinned
      ? positive(cell.pinned_total)
      // FSP is a stay total, so the derivation runs on the whole stay at the parent nightly.
      : positive(applyDerivation(parent * nights, cell.derivation_type, cell.derivation_value, rounding));
    if (total === null) continue;

    const row = rows.get(guests) ?? new Map<number, { price: number; pinned: boolean }>();
    const existing = row.get(nights);
    // Same nights x guests twice: a pin is authoritative, otherwise the later row wins.
    if (existing?.pinned === true && cell.is_pinned !== true) continue;
    row.set(nights, { price: total, pinned: cell.is_pinned === true });
    rows.set(guests, row);
  }

  return {
    date,
    default_price: parent,
    rows: [...rows.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([nr_of_guests, prices]) => ({
        nr_of_guests,
        prices: [...prices.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([nr_of_nights, v]) => ({ nr_of_nights, price: v.price })),
      })),
  };
}

function defaultConvertAmount(amount: number, effectiveRate: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount * effectiveRate);
}

/**
 * Publish the matrix in the fallback currency. `convertPriceEntries` is Season-shaped, so the FSP
 * form gets its own converter instead of overloading it.
 */
export function convertFspSeasons(
  seasons: RuFspSeason[],
  effectiveRate: number,
  /** Same rounding-up rule as `convertAmount` in ruCurrency; injectable to keep this file pure. */
  convertAmount: (amount: number, effectiveRate: number) => number = defaultConvertAmount,
): RuFspSeason[] {
  return seasons.map((s) => ({
    ...s,
    default_price: convertAmount(Number(s.default_price), effectiveRate),
    rows: s.rows.map((r) => ({
      ...r,
      prices: r.prices.map((c) => ({ ...c, price: convertAmount(Number(c.price), effectiveRate) })),
    })),
  }));
}
