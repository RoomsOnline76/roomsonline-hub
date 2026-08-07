/**
 * ratePricing.ts — the PURE nightly rate calculation layer.
 *
 * Zero I/O: no supabase client, no fetch, no Date.now(), no mutation of inputs.
 * Given a plain `PricingInputs` snapshot it decides what a night costs, so the
 * booking engine, ARI builders, channel pushes and reporting all compute the
 * same number from the same rules.
 *
 * Ownership boundaries (do not blur these):
 *   - The CALENDAR owns "which season is active on date X" and manual daily overrides.
 *   - RATE PLANS own the commercial product and the amount (or multiplier) per season.
 *
 * Priority per night, highest first:
 *   1. daily_override    — Calendar-owned manual price for that exact date
 *   2. plan_season       — rolos_rate_plan_season_rates (absolute, or +amount / +percent)
 *   3. calendar_season   — legacy season_rates authored in the old Calendar rate grid
 *   4. relational_season — rolos_rate_seasons + rolos_rate_prices (legacy tier)
 *   5. rack_rate         — rate plan base rate
 *   6. unit_daily_rate   — hostfully_room_types.daily_rate (last resort)
 *
 * A night that no tier prices is NOT priced at zero — it is omitted and surfaced
 * through coverage as unpriced.
 */

import type { DayRate, RateSource, UnitRateContext } from "./rateResolution.ts";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface PricingSeasonPeriod {
  from: string;
  to: string;
}

/** A Calendar-owned season. The Calendar is the ONLY authority for these. */
export interface PricingSeason {
  id: string;
  name?: string;
  min_stay: number;
  periods: PricingSeasonPeriod[];
}

export type DifferentialType = "none" | "amount" | "percent";

/** The rate plan link for one unit (rolos_rate_plan_room_types + rolos_rate_plans). */
export interface PricingRatePlan {
  rate_plan_id: string;
  base_rate: number;
  pricing_model: string;
  /** false => the whole plan is skipped and pricing falls through to the next tier. */
  is_active: boolean;
  extra_adult_rate?: number;
  min_stay?: number | null;
  max_stay?: number | null;
  /** Unit-level differential applied to plan-derived amounts (tiers 3-5). */
  differential_type?: DifferentialType;
  differential_value?: number | null;
}

/** A plan-centric seasonal rate keyed to a Calendar season or its own window. */
export interface PlanSeasonRate {
  /** Calendar season id this rate prices, when linked to the Calendar. */
  calendar_season_id?: string | null;
  /** Explicit window, used when no calendar season is linked. */
  start_date?: string | null;
  end_date?: string | null;
  /** Absolute nightly rate. Takes precedence over a differential. */
  base_rate?: number | null;
  extra_adult_rate?: number | null;
  differential_type?: DifferentialType;
  differential_value?: number | null;
  min_stay?: number | null;
  max_stay?: number | null;
}

/** Legacy relational season window (rolos_rate_seasons + rolos_rate_prices). */
export interface PricingRelationalRate {
  start_date: string;
  end_date: string;
  base_rate: number;
  extra_adult_rate?: number;
  min_stay_override?: number | null;
  /** Authored season name, when known. */
  season_name?: string | null;
}

/** A Calendar-owned manual override for one exact date. Always final. */
export interface DailyOverride {
  price?: number | null;
  extra_guest_price?: number | null;
  min_stay?: number | null;
  max_stay?: number | null;
  closed_to_arrival?: boolean;
  closed_to_departure?: boolean;
}

export interface PricingInputs {
  /** Calendar seasons (properties.amenities.seasons, normalised). */
  seasons: PricingSeason[];
  /** properties.amenities.season_rates, in its authored shape. */
  seasonRates: Record<string, unknown>;
  /** Candidate season_rates lookup keys per unit id. */
  seasonRateKeys: Record<string, string[]>;
  /** Rate plan per linked_rolos_id. */
  ratePlans: Record<string, PricingRatePlan>;
  /** Plan seasonal rates per linked_rolos_id. */
  planSeasonRates: Record<string, PlanSeasonRate[]>;
  /** Legacy relational season rates per linked_rolos_id. */
  relationalSeasonRates: Record<string, PricingRelationalRate[]>;
  /** hostfully_room_types.daily_rate per unit id. */
  unitDailyRates: Record<string, number>;
  /** Calendar daily overrides: unit key (rolos id or unit id) -> date -> override. */
  dailyOverrides: Record<string, Record<string, DailyOverride>>;
  /** Stop-sell dates per linked_rolos_id. */
  closedDates?: Record<string, Set<string> | string[]>;
}

export interface StayRules {
  min_stay: number;
  max_stay: number | null;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers (duplicated intentionally so this module imports no runtime code)
// ---------------------------------------------------------------------------

export function addDaysPure(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function eachDatePure(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 2000) {
    out.push(cur);
    cur = addDaysPure(cur, 1);
  }
  return out;
}

const positive = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function emptyInputs(): PricingInputs {
  return {
    seasons: [],
    seasonRates: {},
    seasonRateKeys: {},
    ratePlans: {},
    planSeasonRates: {},
    relationalSeasonRates: {},
    unitDailyRates: {},
    dailyOverrides: {},
    closedDates: {},
  };
}

/** Fill in any missing collection so callers can pass partial snapshots safely. */
export function normalizePricingInputs(partial: Partial<PricingInputs>): PricingInputs {
  const base = emptyInputs();
  return {
    ...base,
    ...partial,
    seasons: partial.seasons ?? base.seasons,
    seasonRates: partial.seasonRates ?? base.seasonRates,
    seasonRateKeys: partial.seasonRateKeys ?? base.seasonRateKeys,
    ratePlans: partial.ratePlans ?? base.ratePlans,
    planSeasonRates: partial.planSeasonRates ?? base.planSeasonRates,
    relationalSeasonRates: partial.relationalSeasonRates ?? base.relationalSeasonRates,
    unitDailyRates: partial.unitDailyRates ?? base.unitDailyRates,
    dailyOverrides: partial.dailyOverrides ?? base.dailyOverrides,
    closedDates: partial.closedDates ?? base.closedDates,
  };
}

// ---------------------------------------------------------------------------
// Lookups — all read-only
// ---------------------------------------------------------------------------

/** The active Calendar season for a date, or null. First match wins (authoring order). */
export function seasonForDate(seasons: PricingSeason[], date: string): PricingSeason | null {
  for (const s of seasons ?? []) {
    for (const p of s?.periods ?? []) {
      if (p?.from && p?.to && date >= p.from && date <= p.to) return s;
    }
  }
  return null;
}

/** Read a calendar season_rates bucket for one season. Mirrors the authored shape. */
export function pickCalendarSeasonRate(
  seasonRates: Record<string, unknown>,
  seasonId: string,
  keys: string[],
  preferredRatePlanId?: string,
): { price: number; extra_guest_price?: number } | null {
  const readBucket = (bucket: unknown): { price: number; extra_guest_price?: number } | null => {
    if (!bucket || typeof bucket !== "object") return null;
    const rec = bucket as Record<string, { roomAmount?: unknown; adultAmount?: unknown }>;
    if (preferredRatePlanId) {
      const direct = rec[`${seasonId}-${preferredRatePlanId}`];
      const amount = positive(direct?.roomAmount);
      if (amount) return { price: amount, extra_guest_price: positive(direct?.adultAmount) };
    }
    let best = 0;
    let bestExtra: number | undefined;
    for (const [subKey, subData] of Object.entries(rec)) {
      if (!subKey.startsWith(`${seasonId}-`)) continue;
      const amount = positive(subData?.roomAmount) ?? 0;
      if (amount > best) {
        best = amount;
        bestExtra = positive(subData?.adultAmount);
      }
    }
    return best > 0 ? { price: best, extra_guest_price: bestExtra } : null;
  };

  for (const key of keys ?? []) {
    const hit = readBucket((seasonRates ?? {})[key]);
    if (hit) return hit;
  }

  // No key matched (legacy single-unit properties, renamed rooms): fall back to the
  // lowest positive rate configured for this season across every bucket.
  let lowest = Infinity;
  let lowestExtra: number | undefined;
  for (const bucket of Object.values(seasonRates ?? {})) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const [subKey, subData] of Object.entries(bucket as Record<string, { roomAmount?: unknown; adultAmount?: unknown }>)) {
      if (!subKey.startsWith(`${seasonId}-`)) continue;
      const amount = positive(subData?.roomAmount);
      if (amount && amount < lowest) {
        lowest = amount;
        lowestExtra = positive(subData?.adultAmount);
      }
    }
  }
  return lowest < Infinity ? { price: lowest, extra_guest_price: lowestExtra } : null;
}

/** The plan season rate covering a date (calendar-season linked first, then window). */
export function planSeasonRateForDate(
  rates: PlanSeasonRate[] | undefined,
  date: string,
  calendarSeasonId: string | null,
): PlanSeasonRate | null {
  if (!rates || rates.length === 0) return null;
  if (calendarSeasonId) {
    const linked = rates.find((r) => r?.calendar_season_id && String(r.calendar_season_id) === calendarSeasonId);
    if (linked) return linked;
  }
  for (const r of rates) {
    if (r?.start_date && r?.end_date && date >= r.start_date && date <= r.end_date) return r;
  }
  return null;
}

function relationalForDate(
  rates: PricingRelationalRate[] | undefined,
  date: string,
): PricingRelationalRate | null {
  for (const r of rates ?? []) {
    if (r?.start_date && r?.end_date && date >= r.start_date && date <= r.end_date) return r;
  }
  return null;
}

/**
 * Apply a unit differential to a plan-derived amount.
 * Never applied to a daily override or an authored calendar season rate — those are final.
 */
export function applyDifferential(
  amount: number,
  type: DifferentialType | undefined,
  value: number | null | undefined,
): number {
  const v = Number(value);
  if (!type || type === "none" || !Number.isFinite(v) || v === 0) return amount;
  const next = type === "percent" ? amount * (1 + v / 100) : amount + v;
  return next > 0 ? Math.round(next * 100) / 100 : amount;
}

const unitKeys = (unit: UnitRateContext): string[] => {
  const keys: string[] = [];
  if (unit?.linked_rolos_id) keys.push(String(unit.linked_rolos_id));
  if (unit?.id) keys.push(String(unit.id));
  return keys;
};

function overrideFor(
  inputs: PricingInputs,
  unit: UnitRateContext,
  date: string,
): DailyOverride | null {
  for (const key of unitKeys(unit)) {
    const hit = inputs.dailyOverrides?.[key]?.[date];
    if (hit) return hit;
  }
  return null;
}

function activePlan(inputs: PricingInputs, unit: UnitRateContext): PricingRatePlan | null {
  const rolosId = unit?.linked_rolos_id ? String(unit.linked_rolos_id) : null;
  const plan = rolosId ? inputs.ratePlans?.[rolosId] : undefined;
  if (!plan || plan.is_active === false) return null;
  return plan;
}

// ---------------------------------------------------------------------------
// The calculation
// ---------------------------------------------------------------------------

/** Price exactly one night for one unit. Returns null when no tier prices it. */
export function resolveNightRate(
  inputs: PricingInputs,
  unit: UnitRateContext,
  date: string,
): DayRate | null {
  const rolosId = unit?.linked_rolos_id ? String(unit.linked_rolos_id) : null;
  const plan = activePlan(inputs, unit);
  const diffType = plan?.differential_type;
  const diffValue = plan?.differential_value;

  // 1. Daily override — Calendar-owned, always final, no differential.
  const override = overrideFor(inputs, unit, date);
  const overridePrice = positive(override?.price);
  if (overridePrice) {
    return {
      date,
      price: overridePrice,
      extra_guest_price: positive(override?.extra_guest_price),
      source: "daily_override" as RateSource,
    };
  }

  const season = seasonForDate(inputs.seasons, date);

  // 2. Plan season rate — Rate Plans are the authoring surface, so they win.
  //    Absolute amount, or a differential on the plan base rate.
  if (plan && rolosId) {
    const planSeason = planSeasonRateForDate(inputs.planSeasonRates?.[rolosId], date, season?.id ?? null);
    if (planSeason) {
      const absolute = positive(planSeason.base_rate);
      const seasonDiff = planSeason.differential_type && planSeason.differential_type !== "none"
        ? applyDifferential(plan.base_rate, planSeason.differential_type, planSeason.differential_value)
        : undefined;
      const raw = absolute ?? positive(seasonDiff);
      if (raw) {
        return {
          date,
          price: applyDifferential(raw, diffType, diffValue),
          extra_guest_price: positive(planSeason.extra_adult_rate) ?? positive(plan.extra_adult_rate),
          source: "plan_season" as RateSource,
          season_name: season?.name,
        };
      }
    }
  }

  // 3. Legacy Calendar season rate — read-only fallback for un-migrated properties.
  if (season) {
    const keys = inputs.seasonRateKeys?.[unit.id] ?? unitKeys(unit);
    const calendar = pickCalendarSeasonRate(inputs.seasonRates, season.id, keys, plan?.rate_plan_id);
    if (calendar) {
      return {
        date,
        price: calendar.price,
        extra_guest_price: calendar.extra_guest_price,
        source: "calendar_season",
        season_name: season.name,
      };
    }
  }

  // 4. Legacy relational season.
  if (rolosId) {
    const rel = relationalForDate(inputs.relationalSeasonRates?.[rolosId], date);
    if (rel) {
      return {
        date,
        price: applyDifferential(rel.base_rate, diffType, diffValue),
        extra_guest_price: rel.extra_adult_rate,
        source: "relational_season",
        season_name: rel.season_name?.trim() || season?.name,
      };
    }
  }

  // 5. Rack rate (plan base rate).
  if (plan) {
    const base = positive(plan.base_rate);
    if (base) {
      return {
        date,
        price: applyDifferential(base, diffType, diffValue),
        extra_guest_price: positive(plan.extra_adult_rate),
        source: "rack_rate",
      };
    }
  }

  // 6. Unit daily rate.
  const unitDaily = positive(inputs.unitDailyRates?.[unit.id]);
  if (unitDaily) return { date, price: unitDaily, source: "unit_daily_rate" };

  return null;
}

/** Price an inclusive date window. Unpriced nights are omitted, never zero-priced. */
export function resolveNightRates(
  inputs: PricingInputs,
  unit: UnitRateContext,
  from: string,
  to: string,
): DayRate[] {
  const out: DayRate[] = [];
  for (const date of eachDatePure(from, to)) {
    const day = resolveNightRate(inputs, unit, date);
    if (day) out.push(day);
  }
  return out;
}

/**
 * Stay rules for a window.
 * Priority: daily override -> plan season override -> rate plan -> Calendar season -> default.
 * min_stay takes the strictest (highest) value found across the window's arrival night.
 */
export function resolveStayRules(
  inputs: PricingInputs,
  unit: UnitRateContext,
  from: string,
  to: string,
): StayRules {
  const rolosId = unit?.linked_rolos_id ? String(unit.linked_rolos_id) : null;
  const plan = activePlan(inputs, unit);
  let minStay = 1;
  let maxStay: number | null = null;
  let cta = false;
  let ctd = false;

  const consider = (min: unknown, max: unknown) => {
    const mi = positive(min);
    if (mi && mi > minStay) minStay = mi;
    const ma = positive(max);
    if (ma && (maxStay === null || ma < maxStay)) maxStay = ma;
  };

  for (const date of eachDatePure(from, to)) {
    const season = seasonForDate(inputs.seasons, date);
    // Lowest priority first so higher tiers can tighten the window.
    if (season) consider(season.min_stay, null);

    if (rolosId) {
      const rel = relationalForDate(inputs.relationalSeasonRates?.[rolosId], date);
      if (rel) consider(rel.min_stay_override, null);
    }

    if (plan) {
      consider(plan.min_stay, plan.max_stay);
      if (rolosId) {
        const planSeason = planSeasonRateForDate(inputs.planSeasonRates?.[rolosId], date, season?.id ?? null);
        if (planSeason) consider(planSeason.min_stay, planSeason.max_stay);
      }
    }

    const override = overrideFor(inputs, unit, date);
    if (override) {
      consider(override.min_stay, override.max_stay);
      if (date === from && override.closed_to_arrival) cta = true;
      if (date === to && override.closed_to_departure) ctd = true;
    }
  }

  return { min_stay: minStay, max_stay: maxStay, closed_to_arrival: cta, closed_to_departure: ctd };
}

/** Stop-sell check for a single date. */
export function isClosed(inputs: PricingInputs, unit: UnitRateContext, date: string): boolean {
  for (const key of unitKeys(unit)) {
    const closed = inputs.closedDates?.[key];
    if (!closed) continue;
    if (closed instanceof Set ? closed.has(date) : closed.includes(date)) return true;
  }
  return false;
}
