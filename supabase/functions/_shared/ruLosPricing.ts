/**
 * Length-of-stay rungs → channel `<LOSS>` ladder on the existing nightly `<Season>` rows.
 *
 * Pure. The nightly `<Price>` stays the parent price resolved by the rate resolver; a rung only
 * ever derives from that parent (or replaces it with its pin). No new pricing model, no
 * full-stay matrix, no long-stay percent specials.
 */

import { applyDerivation, type LosRung } from "./ratePricing.ts";

export type RuLosPricing = {
  nights: number;
  price: number;
  losps?: { nr_of_guests: number; price: number }[];
};

/** Mirrors the engine's window rule: plan-wide rungs with no window never fire. */
export function windowCoversRung(
  row: Pick<LosRung, "calendar_season_id" | "start_date" | "end_date">,
  dateFrom: string,
  dateTo: string,
  calendarSeasonId: string | null,
): boolean {
  if (row?.calendar_season_id) {
    return Boolean(calendarSeasonId) && String(row.calendar_season_id) === calendarSeasonId;
  }
  if (row?.start_date && row?.end_date) {
    return dateFrom >= row.start_date && dateTo <= row.end_date;
  }
  return false;
}

function unitScoped(rungUnit: string | null | undefined, unitRolosId: string | null): boolean {
  const scoped = rungUnit ? String(rungUnit) : "";
  if (!scoped) return true;
  return Boolean(unitRolosId) && scoped === unitRolosId;
}

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function losPricingForPeriod(opts: {
  parentNightly: number;
  rungs: LosRung[];
  dateFrom: string;
  dateTo: string;
  calendarSeasonId: string | null;
  unitRolosId: string | null;
  rounding?: string | null;
}): RuLosPricing[] {
  const { parentNightly, rungs, dateFrom, dateTo, calendarSeasonId, unitRolosId, rounding } = opts;
  if (!Number.isFinite(parentNightly) || parentNightly <= 0) return [];
  if (!Array.isArray(rungs) || rungs.length === 0) return [];

  const byNights = new Map<number, RuLosPricing>();
  const pinned = new Map<number, boolean>();

  for (const rung of rungs) {
    const nights = Number(rung?.nights);
    if (!Number.isFinite(nights) || nights < 1) continue;
    if (!unitScoped(rung?.room_type_id, unitRolosId)) continue;
    if (!windowCoversRung(rung, dateFrom, dateTo, calendarSeasonId)) continue;

    let price: number | null = null;
    if (rung.is_pinned) {
      price = positive(rung.pinned_rate);
    } else {
      price = positive(applyDerivation(parentNightly, rung.derivation_type, rung.derivation_value, rounding));
    }
    if (price === null) continue;

    // Same threshold twice: a pin is authoritative, otherwise the later row wins.
    const existing = pinned.get(nights);
    if (existing === true && rung.is_pinned !== true) continue;
    pinned.set(nights, rung.is_pinned === true);
    byNights.set(nights, { nights, price });

  }

  return [...byNights.values()].sort((a, b) => a.nights - b.nights);
}

/** Stable identity of a ladder, so a compressed period can be split where the ladder changes. */
export function losFingerprint(los: RuLosPricing[]): string {
  if (!Array.isArray(los) || los.length === 0) return "";
  return [...los]
    .sort((a, b) => a.nights - b.nights)
    .map((l) => `${l.nights}:${l.price}`)
    .join("|");
}

interface LosPeriodLike {
  date_from: string;
  date_to: string;
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Split each period wherever its per-night ladder changes. `compressToPeriods` groups on the
 * nightly price only, so a season boundary with an identical parent nightly would otherwise glue
 * two different ladders into one Season (and the whole-period window rule would drop both).
 * Local to this adapter on purpose — other callers keep today's grouping.
 */
export function splitPeriodsByLos<T extends LosPeriodLike>(
  periods: T[],
  ladderForDate: (date: string) => RuLosPricing[],
): (T & { los_pricing?: RuLosPricing[] })[] {
  const out: (T & { los_pricing?: RuLosPricing[] })[] = [];
  for (const period of periods) {
    let start = period.date_from;
    let cursor = period.date_from;
    let ladder = ladderForDate(cursor);
    let fingerprint = losFingerprint(ladder);

    while (cursor < period.date_to) {
      const next = addDaysIso(cursor, 1);
      const nextLadder = ladderForDate(next);
      const nextFingerprint = losFingerprint(nextLadder);
      if (nextFingerprint !== fingerprint) {
        out.push({
          ...period,
          date_from: start,
          date_to: cursor,
          ...(ladder.length > 0 ? { los_pricing: ladder } : {}),
        });
        start = next;
        ladder = nextLadder;
        fingerprint = nextFingerprint;
      }
      cursor = next;
    }

    out.push({
      ...period,
      date_from: start,
      date_to: period.date_to,
      ...(ladder.length > 0 ? { los_pricing: ladder } : {}),
    });
  }
  return out;
}
