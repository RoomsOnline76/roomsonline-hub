/**
 * Shared rate resolution — the LOADER around the pure calculation layer.
 *
 * This module fetches everything needed to price a property and hands it to
 * `ratePricing.ts`, which contains the actual (pure, unit-tested) decision logic.
 *
 * Hierarchy (identical for the ROL booking engine, Rentals United and every channel):
 *   1. Daily override        — Calendar-owned manual price for an exact date
 *   2. Rate plan season rate — rolos_rate_plan_season_rates (absolute or differential)
 *   3. Calendar season rate  — properties.amenities.season_rates (legacy grid, read-only)
 *   4. Relational season     — rolos_rate_seasons + rolos_rate_prices (legacy tier)
 *   5. Rack rate             — rolos_rate_plans.base_rate
 *   6. Unit daily rate       — hostfully_room_types.daily_rate (last resort)
 *
 * The Calendar owns season DATES and manual daily overrides only; Rate Plans own the
 * amounts. Lower tiers only fill dates the higher tiers do not price.
 */

import {
  normalizePricingInputs,
  resolveNightRates,
  type DifferentialType,
  type FspCell,
  type LosRung,
  type ParentPlanPricing,
  type PlanSeasonRate,

  type PricingInputs,
  type PricingRatePlan,
  type PricingSeason,
} from "./ratePricing.ts";

export type RateSource =
  | "daily_override"
  | "calendar_season"
  | "plan_season"
  | "relational_season"
  | "rack_rate"
  | "unit_daily_rate"
  /** Price computed off a parent plan (Tour Operator off RACK, BAR Net off BAR). */
  | "derived";


export interface UnitRateContext {
  id: string;
  name: string;
  linked_rolos_id?: string | null;
}

export interface DayRate {
  date: string;
  price: number;
  extra_guest_price?: number;
  source: RateSource;
  /** Human-readable season name as authored in the Calendar, when the night is seasonal. */
  season_name?: string;
}

export interface RatePeriod {
  date_from: string;
  date_to: string;
  price: number;
  extra_guest_price?: number;
  source: RateSource;
}

export interface RateCoverage {
  total_days: number;
  priced_days: number;
  calendar_days: number;
  /** Days priced from a Calendar-owned manual daily override (tier 1). */
  daily_override_days: number;
  /** Days priced from rolos_rate_plan_season_rates (tier 3). */
  plan_season_days: number;
  /** Days priced from rolos_rate_seasons + rolos_rate_prices (tier 4). */
  relational_days: number;
  /** Days priced off a parent plan through derivation. */
  derived_days: number;
  rack_days: number;

  unit_daily_days: number;
  unpriced_days: number;
}


export interface RackRate {
  base_rate: number;
  pricing_model: string;
  rate_plan_id?: string;
  adult_1_rate?: number;
  adult_2_rate?: number;
}

interface SeasonPeriod {
  from: string;
  to: string;
}

interface SeasonEntry {
  id: string;
  name?: string;
  min_stay: number;
  periods: SeasonPeriod[];
}

/** A relational season price window (rolos_rate_seasons + rolos_rate_prices). */
export interface RelationalSeasonRate {
  start_date: string;
  end_date: string;
  base_rate: number;
  extra_adult_rate?: number;
  min_stay_override?: number | null;
  /** Authored season name (rolos_rate_seasons.name), for display in previews. */
  season_name?: string | null;
}

export interface RateResolver {
  seasons: SeasonEntry[];
  /** rack rate per linked_rolos_id */
  rackRates: Record<string, RackRate>;
  /** relational season rates per linked_rolos_id (tier 4) */
  relationalSeasonRates: Record<string, RelationalSeasonRate[]>;
  /** hostfully_room_types.daily_rate per unit id */
  unitDailyRates: Record<string, number>;
  /** stop-sell dates per linked_rolos_id */
  closedDates: Record<string, Set<string>>;
  /** Active units of the property, as loaded from hostfully_room_types. */
  units: UnitRateContext[];
  /** Active rate plan per linked_rolos_id — a unit missing here can never be priced. */
  ratePlans: Record<string, PricingRatePlan>;
  /** The exact snapshot handed to the pure calculation layer (debug / parity use). */
  pricingInputs?: PricingInputs;

  resolveDays: (unit: UnitRateContext, from: string, to: string) => DayRate[];
  coverage: (days: DayRate[]) => RateCoverage;
  /**
   * Units whose `linked_rolos_id` resolves to no rate plan, rack rate or daily rate at all —
   * usually a ROL'OS room type that was replaced, leaving the unit link dangling. Reported
   * separately so "no rates for 365 days" is never shown for what is really a broken link.
   */
  unlinkedUnits: () => { id: string; name: string; linked_rolos_id: string | null }[];
}



export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 2000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function normalizeSeasons(amenities: Record<string, any>): SeasonEntry[] {
  const raw = Array.isArray(amenities?.seasons) ? amenities.seasons : [];
  const seasons: SeasonEntry[] = [];
  for (const s of raw) {
    if (!s || s.id == null) continue;
    const rawPeriods = Array.isArray(s.periods) && s.periods.length > 0
      ? s.periods
      : [{ from: s.from ?? s.start_date ?? s.startDate, to: s.to ?? s.end_date ?? s.endDate }];
    const periods: SeasonPeriod[] = [];
    for (const p of rawPeriods) {
      const from = p?.from ?? p?.start_date ?? p?.startDate;
      const to = p?.to ?? p?.end_date ?? p?.endDate;
      if (from && to) periods.push({ from: String(from), to: String(to) });
    }
    if (periods.length > 0) {
      seasons.push({ id: String(s.id), name: s.name ? String(s.name) : (s.label ? String(s.label) : undefined), min_stay: Number(s.minStay ?? s.min_stay ?? 1) || 1, periods });
    }
  }
  return seasons;
}

/** Candidate keys used to look a unit up inside amenities.season_rates. */
export function seasonRateLookupKeys(
  unit: UnitRateContext,
  amenities: Record<string, any>,
): string[] {
  const keys: string[] = [unit.id];
  if (unit.linked_rolos_id) keys.push(String(unit.linked_rolos_id));

  const roomTypes = Array.isArray(amenities?.room_types) ? amenities.room_types : [];
  for (const rt of roomTypes) {
    if (!rt) continue;
    const nameMatch = rt.name && unit.name && String(rt.name).trim().toLowerCase() === String(unit.name).trim().toLowerCase();
    const idMatch = rt.id != null && String(rt.id) === unit.id;
    const rolosMatch = unit.linked_rolos_id && rt.linked_rolos_id === unit.linked_rolos_id;
    const overviewMatch = unit.linked_rolos_id && rt.linked_overview_id === unit.linked_rolos_id;
    if (nameMatch || idMatch || rolosMatch || overviewMatch) {
      if (rt.id != null) keys.push(String(rt.id));
      if (rt.linked_overview_id) keys.push(String(rt.linked_overview_id));
      if (rt.linked_rolos_id) keys.push(String(rt.linked_rolos_id));
    }
  }
  if (unit.name) keys.push(unit.name);
  return [...new Set(keys.filter(Boolean))];
}

// The season_rates reader lives in ratePricing.ts (pure + unit tested); it is
// re-exported here so existing importers keep working.
export { pickCalendarSeasonRate as pickSeasonRate } from "./ratePricing.ts";




/**
 * Loads everything needed to price any unit of a property between two dates and
 * returns a resolver that applies the calendar-first hierarchy day by day.
 */
export async function createRateResolver(
  supabase: any,
  propertyId: string,
  opts: {
    amenities?: Record<string, any> | null;
    window?: { from: string; to: string };
    /** "direct" prices the website/checkout, "channels" the Channel Manager / OTA push. */
    audience?: "direct" | "channels";
  } = {},
): Promise<RateResolver> {
  let amenities = opts.amenities ?? null;
  if (!amenities) {
    const { data } = await supabase.from("properties").select("amenities").eq("id", propertyId).maybeSingle();
    amenities = (data?.amenities ?? {}) as Record<string, any>;
  }
  const amen = (amenities ?? {}) as Record<string, any>;
  const seasonRates: Record<string, any> =
    amen.season_rates && typeof amen.season_rates === "object" ? amen.season_rates : {};
  const seasons = normalizeSeasons(amen);

  const { data: hfAllRooms } = await supabase
    .from("hostfully_room_types")
    .select("id, name, linked_rolos_id, daily_rate, is_active")
    .eq("property_id", propertyId);

  // Only sellable units may set a price. When a native ROL'OS property has no
  // active mirror rows at all, fall back to its own active room types so its
  // Rate Plans still price the property.
  let hfRooms = ((hfAllRooms ?? []) as any[]).filter((r) => r.is_active !== false);
  if (hfRooms.length === 0) {
    const { data: nativeRooms } = await supabase
      .from("rolos_room_types")
      .select("id, name")
      .eq("property_id", propertyId)
      .eq("is_active", true);
    hfRooms = ((nativeRooms ?? []) as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      linked_rolos_id: r.id,
      daily_rate: null,
    }));
  }

  const unitDailyRates: Record<string, number> = {};
  const rolosIds: string[] = [];
  for (const r of hfRooms as any[]) {
    const daily = Number(r.daily_rate);
    if (Number.isFinite(daily) && daily > 0) unitDailyRates[r.id] = daily;
    if (r.linked_rolos_id) rolosIds.push(String(r.linked_rolos_id));
  }


  const rackRates: Record<string, RackRate> = {};
  const closedDates: Record<string, Set<string>> = {};
  const relationalSeasonRates: Record<string, RelationalSeasonRate[]> = {};
  const ratePlans: Record<string, PricingRatePlan> = {};
  const planSeasonRates: Record<string, PlanSeasonRate[]> = {};
  const losRungs: Record<string, LosRung[]> = {};
  const fspCells: Record<string, FspCell[]> = {};
  const parentPlans: Record<string, ParentPlanPricing> = {};
  const dailyOverrides: Record<string, Record<string, never>> = {};

  if (rolosIds.length > 0) {
    const { data: planLinks } = await supabase
      .from("rolos_rate_plan_room_types")
      .select(
        "room_type_id, rate_plan_id, is_active, differential_type, differential_value, rolos_rate_plans!inner(id, base_rate, pricing_model, adult_1_rate, adult_2_rate, is_active, min_stay, max_stay, is_primary_sell, push_to_channels, sell_priority, derived_from_plan_id, derivation_type, derivation_value, derivation_rounding, los_enabled, fsp_enabled)",
      )
      .in("room_type_id", rolosIds)
      .eq("rolos_rate_plans.is_active", true);


    const audience = opts.audience ?? "direct";
    const liveLinks = ((planLinks ?? []) as any[]).filter((entry) => entry?.is_active !== false && entry?.rolos_rate_plans);

    /**
     * One plan wins per unit. Order: the property's primary/live plan, then the
     * lowest sell_priority, then the highest base rate (the historic behaviour,
     * now only a last-resort tie-break).
     */
    const better = (a: any, b: any): boolean => {
      const pa = a.rolos_rate_plans, pb = b.rolos_rate_plans;
      if (Boolean(pa?.is_primary_sell) !== Boolean(pb?.is_primary_sell)) return Boolean(pa?.is_primary_sell);
      const sa = Number(pa?.sell_priority ?? 100), sb = Number(pb?.sell_priority ?? 100);
      if (sa !== sb) return sa < sb;
      return Number(pa?.base_rate ?? 0) > Number(pb?.base_rate ?? 0);
    };

    // Channel pushes only price from plans flagged for distribution; when a unit
    // has none, fall back to every eligible plan so a push never prices nothing.
    const winners: Record<string, any> = {};
    for (const roomId of new Set(liveLinks.map((l) => String(l.room_type_id)))) {
      const forRoom = liveLinks.filter((l) => String(l.room_type_id) === roomId);
      const scoped = audience === "channels"
        ? (forRoom.filter((l) => l.rolos_rate_plans?.push_to_channels !== false).length > 0
            ? forRoom.filter((l) => l.rolos_rate_plans?.push_to_channels !== false)
            : forRoom)
        : forRoom;
      let win = scoped[0];
      for (const cand of scoped.slice(1)) if (better(cand, win)) win = cand;
      if (win) winners[roomId] = win;
    }

    const planToRooms: Record<string, string[]> = {};
    for (const [roomId, entry] of Object.entries(winners)) {
      const plan = entry.rolos_rate_plans;
      if (entry.rate_plan_id) (planToRooms[entry.rate_plan_id] ||= []).push(roomId);
      const base = Number(plan?.base_rate);
      const adult1 = Number.isFinite(Number(plan?.adult_1_rate)) && Number(plan?.adult_1_rate) > 0 ? Number(plan.adult_1_rate) : undefined;
      if (Number.isFinite(base) && base > 0) {
        rackRates[roomId] = {
          base_rate: base,
          pricing_model: plan?.pricing_model || "per_unit",
          rate_plan_id: plan?.id,
          adult_1_rate: adult1,
          adult_2_rate: Number.isFinite(Number(plan?.adult_2_rate)) && Number(plan?.adult_2_rate) > 0 ? Number(plan.adult_2_rate) : undefined,
        };
      }
      ratePlans[roomId] = {
        rate_plan_id: String(plan?.id ?? entry.rate_plan_id),
        base_rate: Number.isFinite(base) && base > 0 ? base : 0,
        pricing_model: plan?.pricing_model || "per_unit",
        is_active: plan?.is_active !== false,
        extra_adult_rate: adult1,
        min_stay: plan?.min_stay ?? null,
        max_stay: plan?.max_stay ?? null,
        differential_type: (entry.differential_type as DifferentialType) ?? "none",
        differential_value: entry.differential_value ?? null,
        derived_from_plan_id: plan?.derived_from_plan_id ? String(plan.derived_from_plan_id) : null,
        derivation_type: (plan?.derivation_type as "percent" | "amount" | null) ?? null,
        derivation_value: plan?.derivation_value ?? null,
        derivation_rounding: plan?.derivation_rounding ?? "nearest_10",
        los_enabled: plan?.los_enabled === true,
        fsp_enabled: plan?.fsp_enabled === true,
      };
    }

    // Parent plans of any derived plan in play. Loaded plan-centric because a
    // parent (a static RACK, or a yielded BAR) may itself sell nothing directly.
    const parentIds = [
      ...new Set(
        Object.values(ratePlans)
          .map((p) => (p.derived_from_plan_id ? String(p.derived_from_plan_id) : null))
          .filter((id): id is string => !!id),
      ),
    ];
    if (parentIds.length > 0) {
      const { data: parentRows } = await supabase
        .from("rolos_rate_plans")
        .select("id, name, base_rate, adult_1_rate, is_active")
        .in("id", parentIds)
        .is("deleted_at", null);

      for (const row of (parentRows ?? []) as any[]) {
        const adult1 = Number(row?.adult_1_rate);
        parentPlans[String(row.id)] = {
          rate_plan_id: String(row.id),
          name: row?.name ?? null,
          base_rate: Number(row?.base_rate) || 0,
          extra_adult_rate: Number.isFinite(adult1) && adult1 > 0 ? adult1 : undefined,
          is_active: row?.is_active !== false,
          seasonRates: [],
          seasonRatesByRoom: {},
        };
      }

      const { data: parentSeasonRows } = await supabase
        .from("rolos_rate_plan_season_rates")
        .select(
          "rate_plan_id, room_type_id, base_rate, extra_adult_rate, differential_type, differential_value, is_active, deleted_at, shared_season_id, legacy_season_id, rolos_shared_seasons(calendar_season_id, start_date, end_date), rolos_rate_seasons(start_date, end_date, min_stay_override)",
        )
        .in("rate_plan_id", parentIds)
        .is("deleted_at", null);

      for (const row of (parentSeasonRows ?? []) as any[]) {
        if (row?.is_active === false) continue;
        const parent = parentPlans[String(row.rate_plan_id)];
        if (!parent) continue;
        const shared = row.rolos_shared_seasons;
        const legacy = row.rolos_rate_seasons;
        const entry: PlanSeasonRate = {
          calendar_season_id: shared?.calendar_season_id ? String(shared.calendar_season_id) : null,
          start_date: shared?.start_date ?? legacy?.start_date ?? null,
          end_date: shared?.end_date ?? legacy?.end_date ?? null,
          base_rate: row.base_rate ?? null,
          extra_adult_rate: row.extra_adult_rate ?? null,
          differential_type: (row.differential_type as DifferentialType) ?? "none",
          differential_value: row.differential_value ?? null,
        };
        if (!entry.calendar_season_id && (!entry.start_date || !entry.end_date)) continue;
        if (row.room_type_id) {
          (parent.seasonRatesByRoom[String(row.room_type_id)] ||= []).push(entry);
        } else {
          parent.seasonRates.push(entry);
        }
      }
    }

    const planIds = Object.keys(planToRooms);

    if (planIds.length > 0 && opts.window) {
      const { data: closures } = await supabase
        .from("rolos_rate_plan_stop_sell")
        .select("rate_plan_id, date")
        .in("rate_plan_id", planIds)
        .gte("date", opts.window.from)
        .lte("date", opts.window.to);
      for (const c of (closures ?? []) as any[]) {
        for (const roomId of planToRooms[c.rate_plan_id] ?? []) {
          (closedDates[roomId] ||= new Set<string>()).add(c.date);
        }
      }
    }

    // Tier 3 — plan season rates (rolos_rate_plan_season_rates). Keyed either to a
    // Calendar season (through rolos_shared_seasons.calendar_season_id) or to a
    // legacy relational season window. Absolute rate wins over a differential.
    if (planIds.length > 0) {
      const { data: planSeasonRows } = await supabase
        .from("rolos_rate_plan_season_rates")
        .select(
          "rate_plan_id, room_type_id, base_rate, extra_adult_rate, differential_type, differential_value, derivation_value, is_pinned, is_active, deleted_at, shared_season_id, legacy_season_id, rolos_shared_seasons(calendar_season_id, start_date, end_date), rolos_rate_seasons(start_date, end_date, min_stay_override)",
        )
        .in("rate_plan_id", planIds)
        .is("deleted_at", null);

      for (const row of (planSeasonRows ?? []) as any[]) {
        if (row?.is_active === false) continue;
        const shared = row.rolos_shared_seasons;
        const legacy = row.rolos_rate_seasons;
        const entry: PlanSeasonRate = {
          calendar_season_id: shared?.calendar_season_id ? String(shared.calendar_season_id) : null,
          start_date: shared?.start_date ?? legacy?.start_date ?? null,
          end_date: shared?.end_date ?? legacy?.end_date ?? null,
          base_rate: row.base_rate ?? null,
          extra_adult_rate: row.extra_adult_rate ?? null,
          differential_type: (row.differential_type as DifferentialType) ?? "none",
          differential_value: row.differential_value ?? null,
          min_stay: legacy?.min_stay_override ?? null,
          derivation_value: row.derivation_value ?? null,
          is_pinned: row.is_pinned === true,
        };

        if (!entry.calendar_season_id && (!entry.start_date || !entry.end_date)) continue;
        const roomKey = row.room_type_id ? String(row.room_type_id) : null;
        const planRooms = planToRooms[row.rate_plan_id] ?? [];
        // A row without a room type applies to every unit the plan won; a room-scoped
        // row only counts when this plan is the selected plan for that unit.
        const targets = roomKey ? (planRooms.includes(roomKey) ? [roomKey] : []) : planRooms;
        for (const target of targets) (planSeasonRates[target] ||= []).push(entry);
      }
    }

    // Stay-shape ladders (LOS rungs / Full Stay cells). Loader-only for now: no plan
    // has the flags on, so these are empty in production. A missing table on a preview
    // branch is treated as "none" so the nightly path always survives.
    if (planIds.length > 0) {
      const [{ data: rungRows }, { data: cellRows }] = await Promise.all([
        supabase
          .from("rolos_rate_plan_los_rungs")
          .select("rate_plan_id, room_type_id, calendar_season_id, start_date, end_date, nights, derivation_type, derivation_value, is_pinned, pinned_rate")
          .in("rate_plan_id", planIds),
        supabase
          .from("rolos_rate_plan_fsp_cells")
          .select("rate_plan_id, room_type_id, calendar_season_id, start_date, end_date, nights, nr_of_guests, derivation_type, derivation_value, is_pinned, pinned_total")
          .in("rate_plan_id", planIds),
      ]);

      const targetsFor = (planId: string, roomTypeId: unknown): string[] => {
        const planRooms = planToRooms[planId] ?? [];
        const roomKey = roomTypeId ? String(roomTypeId) : null;
        return roomKey ? (planRooms.includes(roomKey) ? [roomKey] : []) : planRooms;
      };

      for (const row of (rungRows ?? []) as any[]) {
        const entry: LosRung = {
          nights: Number(row.nights),
          derivation_type: row.derivation_type === "amount" ? "amount" : "percent",
          derivation_value: Number(row.derivation_value) || 0,
          is_pinned: row.is_pinned === true,
          pinned_rate: row.pinned_rate ?? null,
          calendar_season_id: row.calendar_season_id ? String(row.calendar_season_id) : null,
          start_date: row.start_date ?? null,
          end_date: row.end_date ?? null,
          room_type_id: row.room_type_id ? String(row.room_type_id) : null,
        };
        if (!Number.isFinite(entry.nights) || entry.nights < 1) continue;
        for (const target of targetsFor(row.rate_plan_id, row.room_type_id)) {
          (losRungs[target] ||= []).push(entry);
        }
      }

      for (const row of (cellRows ?? []) as any[]) {
        const entry: FspCell = {
          nights: Number(row.nights),
          nr_of_guests: Number(row.nr_of_guests),
          derivation_type: row.derivation_type === "amount" || row.derivation_type === "percent"
            ? row.derivation_type
            : null,
          derivation_value: row.derivation_value ?? null,
          is_pinned: row.is_pinned === true,
          pinned_total: row.pinned_total ?? null,
          calendar_season_id: row.calendar_season_id ? String(row.calendar_season_id) : null,
          start_date: row.start_date ?? null,
          end_date: row.end_date ?? null,
          room_type_id: row.room_type_id ? String(row.room_type_id) : null,
        };
        if (!Number.isFinite(entry.nights) || entry.nights < 1) continue;
        if (!Number.isFinite(entry.nr_of_guests) || entry.nr_of_guests < 1) continue;
        for (const target of targetsFor(row.rate_plan_id, row.room_type_id)) {
          (fspCells[target] ||= []).push(entry);
        }
      }
    }



    // Tier 4 — relational seasons (rolos_rate_seasons + rolos_rate_prices).
    // Never overrides a calendar or plan season rate, it only fills dates they leave unpriced.
    if (planIds.length > 0) {
      const { data: relSeasons } = await supabase
        .from("rolos_rate_seasons")
        .select("id, rate_plan_id, name, start_date, end_date, min_stay_override")
        .in("rate_plan_id", planIds);

      const seasonRows = (relSeasons ?? []) as any[];
      if (seasonRows.length > 0) {
        const { data: relPrices } = await supabase
          .from("rolos_rate_prices")
          .select("season_id, room_type_id, base_rate, extra_adult_rate")
          .in("season_id", seasonRows.map((s) => s.id));

        const seasonById = new Map<string, any>(seasonRows.map((s) => [String(s.id), s]));
        for (const price of (relPrices ?? []) as any[]) {
          const season = seasonById.get(String(price.season_id));
          const base = Number(price?.base_rate);
          if (!season?.start_date || !season?.end_date) continue;
          if (!Number.isFinite(base) || base <= 0) continue;
          const roomKey = price.room_type_id ? String(price.room_type_id) : null;
          const planRooms = planToRooms[season.rate_plan_id] ?? [];
          // Only the plan selected for a unit may price it.
          const targets = roomKey ? (planRooms.includes(roomKey) ? [roomKey] : []) : planRooms;
          const extra = Number(price?.extra_adult_rate);
          for (const target of targets) {
            (relationalSeasonRates[target] ||= []).push({
              start_date: String(season.start_date),
              end_date: String(season.end_date),
              base_rate: base,
              extra_adult_rate: Number.isFinite(extra) && extra > 0 ? extra : undefined,
              min_stay_override: season.min_stay_override ?? null,
              season_name: season.name ? String(season.name) : null,
            });
          }
        }
      }
    }
  }

  const units: UnitRateContext[] = ((hfRooms ?? []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    linked_rolos_id: r.linked_rolos_id,
  }));

  const seasonRateKeys: Record<string, string[]> = {};
  for (const unit of units) seasonRateKeys[unit.id] = seasonRateLookupKeys(unit, amen);

  // The snapshot handed to the pure calculation layer. Everything below this line
  // is side-effect free: no query, no clock, no mutation.
  const pricingInputs: PricingInputs = normalizePricingInputs({
    seasons: seasons as PricingSeason[],
    seasonRates,
    seasonRateKeys,
    ratePlans,
    planSeasonRates,
    parentPlans,

    relationalSeasonRates,
    unitDailyRates,
    // No Calendar-owned per-date rate override store exists yet; the engine already
    // honours this tier as soon as one is wired in.
    dailyOverrides: dailyOverrides as Record<string, Record<string, never>>,
    closedDates,
  });

  const resolveDays = (unit: UnitRateContext, from: string, to: string): DayRate[] => {
    const keys = seasonRateKeys[unit.id] ?? seasonRateLookupKeys(unit, amen);
    const inputs = keys === pricingInputs.seasonRateKeys[unit.id]
      ? pricingInputs
      : { ...pricingInputs, seasonRateKeys: { ...pricingInputs.seasonRateKeys, [unit.id]: keys } };
    return resolveNightRates(inputs, unit, from, to);
  };

  const coverage = (days: DayRate[]): RateCoverage => {
    const count = (source: RateSource) => days.filter((d) => d.source === source).length;
    return {
      total_days: days.length,
      priced_days: days.length,
      calendar_days: count("calendar_season"),
      daily_override_days: count("daily_override"),
      plan_season_days: count("plan_season"),
      relational_days: count("relational_season"),
      derived_days: count("derived"),

      rack_days: count("rack_rate"),
      unit_daily_days: count("unit_daily_rate"),
      unpriced_days: 0,
    };
  };

  const unlinkedUnits = () =>
    units
      .filter((unit) => {
        const link = unit.linked_rolos_id ? String(unit.linked_rolos_id) : "";
        if (!link) return true;
        if (ratePlans[link] || rackRates[link] || (relationalSeasonRates[link]?.length ?? 0) > 0) return false;
        if (Number(unitDailyRates[unit.id]) > 0) return false;
        const keys = seasonRateKeys[unit.id] ?? [];
        return !keys.some((key) => seasonRates[key]);
      })
      .map((unit) => ({ id: unit.id, name: unit.name, linked_rolos_id: unit.linked_rolos_id ?? null }));

  return {
    seasons,
    rackRates,
    relationalSeasonRates,
    unitDailyRates,
    closedDates,
    units,
    ratePlans,
    pricingInputs,
    resolveDays,
    coverage,
    unlinkedUnits,
  };


}


export interface PriceWindowNormalisation {
  days: DayRate[];
  unpriced_dates: string[];
  duplicate_dates_resolved: number;
  expected_days: number;
}

/**
 * Normalise a resolved day-rate set for an outbound channel push.
 * - drops days outside [from, to]
 * - de-duplicates by date (last authored day wins)
 * - sorts ascending
 * - reports every date inside the window that has no price
 */
export function normalizePriceWindow(days: DayRate[], from: string, to: string): PriceWindowNormalisation {
  const perDate = new Map<string, DayRate>();
  let duplicates = 0;
  for (const d of days) {
    if (!d?.date || d.date < from || d.date > to) continue;
    if (perDate.has(d.date)) duplicates++;
    perDate.set(d.date, d);
  }
  const window = eachDate(from, to);
  const unpriced: string[] = [];
  for (const date of window) {
    const d = perDate.get(date);
    if (!d || !Number.isFinite(d.price) || d.price <= 0) unpriced.push(date);
  }
  const normalised = window
    .map((date) => perDate.get(date))
    .filter((d): d is DayRate => !!d && Number.isFinite(d.price) && d.price > 0);
  return {
    days: normalised,
    unpriced_dates: unpriced,
    duplicate_dates_resolved: duplicates,
    expected_days: window.length,
  };
}

/** Assert compressed periods are strictly ascending and non-overlapping. Returns offending pairs. */
export function findPeriodOverlaps(periods: RatePeriod[]): { a: string; b: string }[] {
  const sorted = [...periods].sort((x, y) => x.date_from.localeCompare(y.date_from));
  const bad: { a: string; b: string }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.date_from <= prev.date_to) {
      bad.push({ a: `${prev.date_from}..${prev.date_to}`, b: `${cur.date_from}..${cur.date_to}` });
    }
  }
  return bad;
}

/** Compress consecutive days with identical pricing into date ranges (RU Season blocks etc.). */
export function compressToPeriods(days: DayRate[]): RatePeriod[] {
  // De-duplicate by date first (last authored wins) so a duplicated date can never
  // produce two overlapping outbound Season ranges.
  const perDate = new Map<string, DayRate>();
  for (const d of days) {
    if (!d?.date) continue;
    perDate.set(d.date, d);
  }
  const sorted = [...perDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const periods: RatePeriod[] = [];
  for (const day of sorted) {
    const last = periods[periods.length - 1];
    const contiguous = last && addDays(last.date_to, 1) === day.date;
    const samePrice =
      last &&
      last.price === day.price &&
      (last.extra_guest_price ?? null) === (day.extra_guest_price ?? null) &&
      last.source === day.source;
    if (contiguous && samePrice) {
      last.date_to = day.date;
    } else {
      periods.push({
        date_from: day.date,
        date_to: day.date,
        price: day.price,
        extra_guest_price: day.extra_guest_price,
        source: day.source,
      });
    }
  }
  return periods;
}


/** Human summary for readiness panels and sync logs. */
export function describeCoverage(expectedDays: number, cov: RateCoverage): string {
  const parts: string[] = [];
  if ((cov.daily_override_days ?? 0) > 0) parts.push(`${cov.daily_override_days} daily override`);
  if (cov.calendar_days > 0) parts.push(`${cov.calendar_days} calendar`);
  if ((cov.plan_season_days ?? 0) > 0) parts.push(`${cov.plan_season_days} plan season`);
  if ((cov.relational_days ?? 0) > 0) parts.push(`${cov.relational_days} rate-plan season`);
  if ((cov.derived_days ?? 0) > 0) parts.push(`${cov.derived_days} derived`);



  if (cov.rack_days > 0) parts.push(`${cov.rack_days} rack rate`);
  if (cov.unit_daily_days > 0) parts.push(`${cov.unit_daily_days} unit daily rate`);
  const detail = parts.length > 0 ? ` — ${parts.join(", ")}` : "";
  return `${cov.priced_days}/${expectedDays} days priced${detail}`;
}
