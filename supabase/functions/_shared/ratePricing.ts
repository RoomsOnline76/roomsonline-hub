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
export type DerivationType = "percent" | "amount";

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
  /** When set, this plan tracks another plan's nightly price (single level only). */
  derived_from_plan_id?: string | null;
  derivation_type?: DerivationType | null;
  derivation_value?: number | null;
  /** Currently only "nearest_10" | "none". Defaults to nearest_10. */
  derivation_rounding?: string | null;
}

/**
 * A parent plan a derived plan tracks. Held plan-centric (not unit-centric) because
 * a parent may price nothing itself — e.g. a static RACK that no unit sells directly.
 */
export interface ParentPlanPricing {
  rate_plan_id: string;
  name?: string | null;
  base_rate: number;
  extra_adult_rate?: number;
  is_active: boolean;
  /** Season rates that apply to every unit of the parent plan. */
  seasonRates: PlanSeasonRate[];
  /** Season rates scoped to one room type id. */
  seasonRatesByRoom: Record<string, PlanSeasonRate[]>;
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
  /** Derived plans: per-season offset override (same type as the plan's offset). */
  derivation_value?: number | null;
  /** Derived plans: a manually typed rate that stops tracking the parent. */
  is_pinned?: boolean;
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
  /** Parent plans keyed by rate_plan_id, for plans other plans derive from. */
  parentPlans?: Record<string, ParentPlanPricing>;
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
    parentPlans: {},
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
    parentPlans: partial.parentPlans ?? base.parentPlans,
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
// Derived plans (Tour Operator off static RACK, BAR Net off yielded BAR)
// ---------------------------------------------------------------------------

/** Round a derived amount. Only "none" skips the nearest-10 rule. */
export function roundDerived(amount: number, rounding?: string | null): number {
  if (!Number.isFinite(amount)) return amount;
  if (rounding === "none") return Math.round(amount * 100) / 100;
  return Math.round(amount / 10) * 10;
}

/** Apply a derived plan's offset to a parent nightly price. */
export function applyDerivation(
  parentPrice: number,
  type: DerivationType | null | undefined,
  value: number | null | undefined,
  rounding?: string | null,
): number | null {
  if (!Number.isFinite(parentPrice) || parentPrice <= 0) return null;
  const v = Number(value);
  if (!type || !Number.isFinite(v)) return null;
  const raw = type === "percent" ? parentPrice * (1 + v / 100) : parentPrice + v;
  const next = roundDerived(raw, rounding);
  return next > 0 ? next : null;
}

/** The parent plan's own nightly price for a unit: season rate, else its base rate. */
function parentNightPrice(
  parent: ParentPlanPricing,
  inputs: PricingInputs,
  unit: UnitRateContext,
  date: string,
  calendarSeasonId: string | null,
): { price: number; extra_guest_price?: number } | null {
  const roomKey = unit?.linked_rolos_id ? String(unit.linked_rolos_id) : null;
  const scoped = (roomKey ? parent.seasonRatesByRoom?.[roomKey] : undefined) ?? [];
  const candidates = [...scoped, ...(parent.seasonRates ?? [])];
  const season = planSeasonRateForDate(candidates, date, calendarSeasonId);
  if (season) {
    const absolute = positive(season.base_rate);
    const diff = season.differential_type && season.differential_type !== "none"
      ? positive(applyDifferential(parent.base_rate, season.differential_type, season.differential_value))
      : undefined;
    const price = absolute ?? diff;
    if (price) {
      return { price, extra_guest_price: positive(season.extra_adult_rate) ?? positive(parent.extra_adult_rate) };
    }
  }
  const base = positive(parent.base_rate);
  if (base) return { price: base, extra_guest_price: positive(parent.extra_adult_rate) };
  return null;
}

/**
 * Price one night for a plan that derives off another plan.
 *
 * 1. A pinned (manually typed) season rate on the derived plan wins outright.
 * 2. Otherwise the parent's resolved nightly price — including the Calendar's
 *    manual daily override, so a yielded BAR flows straight through — with the
 *    plan offset (or that season's offset override) applied and rounded.
 * 3. If the parent cannot price the night, the derived plan does not either.
 */
export function resolveDerivedNight(
  inputs: PricingInputs,
  unit: UnitRateContext,
  plan: PricingRatePlan,
  date: string,
): DayRate | null {
  const rolosId = unit?.linked_rolos_id ? String(unit.linked_rolos_id) : null;
  const season = seasonForDate(inputs.seasons, date);
  const ownSeason = rolosId
    ? planSeasonRateForDate(inputs.planSeasonRates?.[rolosId], date, season?.id ?? null)
    : null;

  // 1. Pinned rate — a typed amount beats the derivation.
  const pinned = ownSeason?.is_pinned ? positive(ownSeason.base_rate) : undefined;
  if (pinned) {
    return {
      date,
      price: applyDifferential(pinned, plan.differential_type, plan.differential_value),
      extra_guest_price: positive(ownSeason?.extra_adult_rate) ?? positive(plan.extra_adult_rate),
      source: "plan_season" as RateSource,
      season_name: season?.name,
    };
  }

  const parent = plan.derived_from_plan_id
    ? inputs.parentPlans?.[String(plan.derived_from_plan_id)]
    : undefined;
  if (!parent || parent.is_active === false) return null;

  // 2a. The Calendar's manual daily override is the parent's yielded price for the night.
  const override = overrideFor(inputs, unit, date);
  const parentResolved = positive(override?.price)
    ? { price: positive(override?.price)!, extra_guest_price: positive(override?.extra_guest_price) }
    : parentNightPrice(parent, inputs, unit, date, season?.id ?? null);
  if (!parentResolved) return null;

  const offsetValue = ownSeason && ownSeason.derivation_value != null
    ? ownSeason.derivation_value
    : plan.derivation_value;
  const price = applyDerivation(
    parentResolved.price,
    plan.derivation_type ?? null,
    offsetValue,
    plan.derivation_rounding,
  );
  if (!price) return null;

  return {
    date,
    price: applyDifferential(price, plan.differential_type, plan.differential_value),
    extra_guest_price: parentResolved.extra_guest_price,
    source: "derived" as RateSource,
    season_name: season?.name,
  };
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

  // 0. A derived plan tracks its parent and nothing else — no rack fallback,
  //    so an unpriced parent night is reported rather than silently substituted.
  if (plan?.derived_from_plan_id) {
    return resolveDerivedNight(inputs, unit, plan, date);
  }

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

// ─── Pricing model (canonical) ─────────────────────────────────────────
// Legacy writers stored free-form values ("UnitRate", "per-unit", "PER PERSON").
// ROL'OS Rate Plans is the only author of this field now, and everything that
// bills or pushes a price must read it through this helper.

export type CanonicalPricingModel =
  | "per_room"
  | "per_person"
  | "per_person_sharing"
  | "per_unit";

export function canonicalPricingModel(raw: unknown): CanonicalPricingModel {
  const v = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!v) return "per_room";
  if (v === "per_person_sharing" || v === "pps" || v === "per_person_share" || v === "sharing") {
    return "per_person_sharing";
  }
  if (v === "unitrate" || v === "unit_rate" || v === "per_unit" || v === "unit") return "per_unit";
  if (v === "per_night" || v === "pernight" || v === "flat" || v === "per_stay") return "per_room";
  if (v.includes("person") || v === "pp" || v === "per_pax" || v === "per_guest") return "per_person";
  if (v.includes("room")) return "per_room";
  if (v.includes("unit")) return "per_unit";
  return "per_room";
}

/** Wire price type a channel/checkout consumer expects for this model. */
export function priceTypeForModel(raw: unknown): "PER_PERSON" | "PER_NIGHT" {
  const model = canonicalPricingModel(raw);
  return model === "per_person" || model === "per_person_sharing" ? "PER_PERSON" : "PER_NIGHT";
}

export interface OccupancyInput {
  /** Nightly rates for the stay (one entry per night). */
  nightlyRates: number[];
  adults: number;
  teens?: number;
  children?: number;
  /** Charged per additional adult beyond the 2 the base rate covers. */
  extraAdultRate?: number;
  childRate?: number;
  teenRate?: number;
  /** Rooms/units booked; only used by per_room / per_unit. */
  units?: number;
}

/**
 * Stay total for a pricing model.
 *  - per_room / per_unit  → nightly rate x nights x units
 *  - per_person           → nightly rate x guests x nights (+ child/teen rates)
 *  - per_person_sharing   → nightly rate covers 2 guests, extras at extraAdultRate
 */
export function stayTotalForModel(raw: unknown, input: OccupancyInput): number {
  const model = canonicalPricingModel(raw);
  const nights = input.nightlyRates.length;
  if (nights === 0) return 0;
  const adults = Math.max(0, input.adults);
  const teens = Math.max(0, input.teens ?? 0);
  const children = Math.max(0, input.children ?? 0);
  const units = Math.max(1, input.units ?? 1);

  let total = 0;
  for (const rate of input.nightlyRates) {
    const nightly = Number(rate) || 0;
    if (model === "per_room" || model === "per_unit") {
      total += nightly * units;
      continue;
    }
    if (model === "per_person") {
      const teenCharge = teens * (input.teenRate ?? nightly);
      const childCharge = children * (input.childRate ?? nightly);
      total += nightly * adults + teenCharge + childCharge;
      continue;
    }
    // per_person_sharing: base covers 2 guests, additional adults billed extra
    const extraAdults = Math.max(0, adults - 2);
    const extraRate = input.extraAdultRate ?? nightly / 2;
    const teenCharge = teens * (input.teenRate ?? extraRate);
    const childCharge = children * (input.childRate ?? extraRate);
    total += nightly + extraAdults * extraRate + teenCharge + childCharge;
  }
  return total;
}
