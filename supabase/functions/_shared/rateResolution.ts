/**
 * Shared rate resolution — the single source of truth for "what does a night cost".
 *
 * Hierarchy (identical for the ROL booking engine, Rentals United and every channel):
 *   1. Calendar season rate  — properties.amenities.seasons + season_rates (admin/ROLOS calendar)
 *   2. Rack rate             — Rate Manager rate plan linked to the unit (rolos_rate_plans.base_rate)
 *   3. Unit daily rate       — hostfully_room_types.daily_rate (last resort)
 *
 * The calendar is ALWAYS first. The rack rate only fills dates the calendar does not price.
 */

export type RateSource = "calendar_season" | "rack_rate" | "unit_daily_rate";

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
  min_stay: number;
  periods: SeasonPeriod[];
}

export interface RateResolver {
  seasons: SeasonEntry[];
  /** rack rate per linked_rolos_id */
  rackRates: Record<string, RackRate>;
  /** hostfully_room_types.daily_rate per unit id */
  unitDailyRates: Record<string, number>;
  /** stop-sell dates per linked_rolos_id */
  closedDates: Record<string, Set<string>>;
  resolveDays: (unit: UnitRateContext, from: string, to: string) => DayRate[];
  coverage: (days: DayRate[]) => RateCoverage;
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
      seasons.push({ id: String(s.id), min_stay: Number(s.minStay ?? s.min_stay ?? 1) || 1, periods });
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

function pickSeasonRate(
  seasonRates: Record<string, any>,
  seasonId: string,
  keys: string[],
  preferredRatePlanId?: string,
): { price: number; extra_guest_price?: number } | null {
  const readBucket = (bucket: any): { price: number; extra_guest_price?: number } | null => {
    if (!bucket || typeof bucket !== "object") return null;
    if (preferredRatePlanId) {
      const direct = bucket[`${seasonId}-${preferredRatePlanId}`];
      const amount = Number(direct?.roomAmount);
      if (Number.isFinite(amount) && amount > 0) {
        const extra = Number(direct?.adultAmount);
        return { price: amount, extra_guest_price: Number.isFinite(extra) && extra > 0 ? extra : undefined };
      }
    }
    let best = 0;
    let bestExtra: number | undefined;
    for (const [subKey, subData] of Object.entries(bucket as Record<string, any>)) {
      if (!subKey.startsWith(`${seasonId}-`)) continue;
      const amount = Number((subData as any)?.roomAmount);
      if (Number.isFinite(amount) && amount > best) {
        best = amount;
        const extra = Number((subData as any)?.adultAmount);
        bestExtra = Number.isFinite(extra) && extra > 0 ? extra : undefined;
      }
    }
    return best > 0 ? { price: best, extra_guest_price: bestExtra } : null;
  };

  for (const key of keys) {
    const hit = readBucket(seasonRates[key]);
    if (hit) return hit;
  }

  // No key matched (legacy single-unit properties, or renamed rooms): fall back to the
  // lowest positive rate configured for this season across every bucket.
  let lowest = Infinity;
  let lowestExtra: number | undefined;
  for (const bucket of Object.values(seasonRates)) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const [subKey, subData] of Object.entries(bucket as Record<string, any>)) {
      if (!subKey.startsWith(`${seasonId}-`)) continue;
      const amount = Number((subData as any)?.roomAmount);
      if (Number.isFinite(amount) && amount > 0 && amount < lowest) {
        lowest = amount;
        const extra = Number((subData as any)?.adultAmount);
        lowestExtra = Number.isFinite(extra) && extra > 0 ? extra : undefined;
      }
    }
  }
  return lowest < Infinity ? { price: lowest, extra_guest_price: lowestExtra } : null;
}


/**
 * Loads everything needed to price any unit of a property between two dates and
 * returns a resolver that applies the calendar-first hierarchy day by day.
 */
export async function createRateResolver(
  supabase: any,
  propertyId: string,
  opts: { amenities?: Record<string, any> | null; window?: { from: string; to: string } } = {},
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

  const { data: hfRooms } = await supabase
    .from("hostfully_room_types")
    .select("id, name, linked_rolos_id, daily_rate")
    .eq("property_id", propertyId);

  const unitDailyRates: Record<string, number> = {};
  const rolosIds: string[] = [];
  for (const r of (hfRooms ?? []) as any[]) {
    const daily = Number(r.daily_rate);
    if (Number.isFinite(daily) && daily > 0) unitDailyRates[r.id] = daily;
    if (r.linked_rolos_id) rolosIds.push(String(r.linked_rolos_id));
  }

  const rackRates: Record<string, RackRate> = {};
  const closedDates: Record<string, Set<string>> = {};

  if (rolosIds.length > 0) {
    const { data: planLinks } = await supabase
      .from("rolos_rate_plan_room_types")
      .select("room_type_id, rate_plan_id, rolos_rate_plans!inner(id, base_rate, pricing_model, adult_1_rate, adult_2_rate, is_active)")
      .in("room_type_id", rolosIds)
      .eq("rolos_rate_plans.is_active", true);

    const planToRooms: Record<string, string[]> = {};
    for (const entry of (planLinks ?? []) as any[]) {
      const plan = entry.rolos_rate_plans;
      if (entry.rate_plan_id) (planToRooms[entry.rate_plan_id] ||= []).push(entry.room_type_id);
      const base = Number(plan?.base_rate);
      if (!Number.isFinite(base) || base <= 0) continue;
      const existing = rackRates[entry.room_type_id];
      if (existing && existing.base_rate >= base) continue;
      rackRates[entry.room_type_id] = {
        base_rate: base,
        pricing_model: plan?.pricing_model || "per_unit",
        rate_plan_id: plan?.id,
        adult_1_rate: Number.isFinite(Number(plan?.adult_1_rate)) && Number(plan?.adult_1_rate) > 0 ? Number(plan.adult_1_rate) : undefined,
        adult_2_rate: Number.isFinite(Number(plan?.adult_2_rate)) && Number(plan?.adult_2_rate) > 0 ? Number(plan.adult_2_rate) : undefined,
      };
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
  }

  const seasonForDate = (date: string): SeasonEntry | null => {
    for (const s of seasons) {
      for (const p of s.periods) {
        if (date >= p.from && date <= p.to) return s;
      }
    }
    return null;
  };

  const resolveDays = (unit: UnitRateContext, from: string, to: string): DayRate[] => {
    const keys = seasonRateLookupKeys(unit, amen);
    const rolosId = unit.linked_rolos_id ? String(unit.linked_rolos_id) : null;
    const rack = rolosId ? rackRates[rolosId] : undefined;
    const unitDaily = unitDailyRates[unit.id];
    const seasonCache = new Map<string, { price: number; extra_guest_price?: number } | null>();

    const out: DayRate[] = [];
    for (const date of eachDate(from, to)) {
      const season = seasonForDate(date);
      let calendar: { price: number; extra_guest_price?: number } | null = null;
      if (season) {
        if (!seasonCache.has(season.id)) {
          seasonCache.set(season.id, pickSeasonRate(seasonRates, season.id, keys, rack?.rate_plan_id));
        }
        calendar = seasonCache.get(season.id) ?? null;
      }

      if (calendar) {
        out.push({ date, price: calendar.price, extra_guest_price: calendar.extra_guest_price, source: "calendar_season" });
      } else if (rack) {
        out.push({ date, price: rack.base_rate, extra_guest_price: rack.adult_1_rate, source: "rack_rate" });
      } else if (Number.isFinite(unitDaily) && unitDaily > 0) {
        out.push({ date, price: unitDaily, source: "unit_daily_rate" });
      }
      // No rate at all for this date: omitted, surfaced through coverage().
    }
    return out;
  };

  const coverage = (days: DayRate[]): RateCoverage => {
    const calendar_days = days.filter((d) => d.source === "calendar_season").length;
    const rack_days = days.filter((d) => d.source === "rack_rate").length;
    const unit_daily_days = days.filter((d) => d.source === "unit_daily_rate").length;
    return {
      total_days: days.length,
      priced_days: days.length,
      calendar_days,
      rack_days,
      unit_daily_days,
      unpriced_days: 0,
    };
  };

  return { seasons, rackRates, unitDailyRates, closedDates, resolveDays, coverage };
}

/** Compress consecutive days with identical pricing into date ranges (RU Season blocks etc.). */
export function compressToPeriods(days: DayRate[]): RatePeriod[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
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
  if (cov.calendar_days > 0) parts.push(`${cov.calendar_days} calendar`);
  if (cov.rack_days > 0) parts.push(`${cov.rack_days} rack rate`);
  if (cov.unit_daily_days > 0) parts.push(`${cov.unit_daily_days} unit daily rate`);
  const detail = parts.length > 0 ? ` — ${parts.join(", ")}` : "";
  return `${cov.priced_days}/${expectedDays} days priced${detail}`;
}
