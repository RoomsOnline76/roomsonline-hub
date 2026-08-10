// Local (pre-publish) bookable-window + MinStay evaluation for Rentals United onboarding.
//
// The certification console can probe the live channel calendar, but before the first
// push there is no channel listing to read. The onboarding wizard and the live push gate
// must still answer the same two questions from ROL'OS data:
//
//   1. are there >= RU_MIN_BOOKABLE_WINDOW consecutive open days carrying a price > 0?
//   2. is a MinStay authored for the open days?
//
// Keeping this in one place is what makes "Phase 2 passed" mean "the push will be accepted".

import { createRateResolver, eachDate, addDays } from "./rateResolution.ts";
import { RU_MIN_BOOKABLE_WINDOW } from "./ruContentQuality.ts";

export interface RuLocalWindow {
  ok: boolean;
  start: string | null;
  longest_run: number;
  open_days: number;
  unpriced_open_days: number;
  min_stay_set: boolean;
  min_stay_days: number;
  /** Where the numbers came from, for evidence trails. */
  source: "local";
  window_from: string;
  window_to: string;
  unit_count: number;
}

const EMPTY = (from: string, to: string): RuLocalWindow => ({
  ok: false,
  start: null,
  longest_run: 0,
  open_days: 0,
  unpriced_open_days: 0,
  min_stay_set: false,
  min_stay_days: 0,
  source: "local",
  window_from: from,
  window_to: to,
  unit_count: 0,
});

/**
 * Scores the strongest sellable run across the forward window. A property is sellable when
 * ANY unit has a bookable, priced run — the per-unit detail stays in the readiness checks.
 */
export async function computeLocalBookableWindow(
  admin: any,
  propertyId: string,
  opts: { days?: number } = {},
): Promise<RuLocalWindow> {
  const days = opts.days ?? 180;
  const from = new Date().toISOString().slice(0, 10);
  const to = addDays(from, days);
  const result = EMPTY(from, to);

  try {
    // ── Stop-sell days authored on the manual calendar ──
    const blockedByUnit = new Map<string, Set<string>>();
    const blockedAll = new Set<string>();
    const minStayDates = new Set<string>();
    const { data: availRows } = await admin
      .from("property_availability")
      .select("date, room_type, available_units, is_stop_sell, minimum_stay")
      .eq("property_id", propertyId)
      .gte("date", from)
      .lte("date", to);
    for (const row of (availRows ?? []) as Record<string, unknown>[]) {
      const date = String(row.date ?? "").slice(0, 10);
      if (!date) continue;
      const closed = row.is_stop_sell === true || Number(row.available_units ?? 1) === 0;
      const label = String(row.room_type ?? "").trim().toLowerCase();
      if (closed) {
        if (label) {
          const set = blockedByUnit.get(label) ?? new Set<string>();
          set.add(date);
          blockedByUnit.set(label, set);
        } else {
          blockedAll.add(date);
        }
      }
      if (Number(row.minimum_stay ?? 0) > 0) minStayDates.add(date);
    }

    // ── MinStay authored anywhere that reaches the channel payload ──
    let minStaySet = minStayDates.size > 0;
    if (!minStaySet) {
      const { data: restrictions } = await admin
        .from("rolos_stay_restrictions")
        .select("min_stay, start_date, end_date")
        .eq("property_id", propertyId)
        .gt("min_stay", 0)
        .lte("start_date", to)
        .gte("end_date", from)
        .limit(1);
      minStaySet = (restrictions ?? []).length > 0;
    }
    if (!minStaySet) {
      const { data: plans } = await admin
        .from("rolos_rate_plans")
        .select("min_stay, is_active")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .gt("min_stay", 0)
        .limit(1);
      minStaySet = (plans ?? []).length > 0;
    }

    // ── Priced days per unit (same resolver the channel push uses) ──
    const resolver = await createRateResolver(admin, propertyId, {
      window: { from, to },
      audience: "channels",
    });
    const units = resolver.units.length > 0 ? resolver.units : [{ id: propertyId, name: null }];
    result.unit_count = units.length;

    const allDates = eachDate(from, to);
    let bestRun = 0;
    let bestStart: string | null = null;
    let bestOpen = 0;
    let bestUnpriced = 0;

    for (const unit of units) {
      const label = String((unit as { name?: string | null }).name ?? "").trim().toLowerCase();
      const unitBlocked = blockedByUnit.get(label) ?? new Set<string>();
      const dayRates = resolver.resolveDays(unit as never, from, to);
      const priced = new Map<string, number>();
      for (const d of dayRates as { date: string; amount?: number | null; price?: number | null }[]) {
        const amount = Number(d.amount ?? d.price ?? 0);
        priced.set(String(d.date).slice(0, 10), amount);
      }

      let run = 0;
      let runStart: string | null = null;
      let open = 0;
      let unpriced = 0;
      for (const date of allDates) {
        const isOpen = !blockedAll.has(date) && !unitBlocked.has(date);
        if (!isOpen) {
          run = 0;
          runStart = null;
          continue;
        }
        open += 1;
        const amount = priced.get(date) ?? 0;
        if (!(amount > 0)) {
          unpriced += 1;
          run = 0;
          runStart = null;
          continue;
        }
        run = run === 0 ? 1 : run + 1;
        if (run === 1) runStart = date;
        if (run > bestRun) {
          bestRun = run;
          bestStart = runStart;
        }
      }
      if (open > bestOpen) bestOpen = open;
      if (unpriced > bestUnpriced) bestUnpriced = unpriced;
    }

    result.longest_run = bestRun;
    result.start = bestStart;
    result.open_days = bestOpen;
    result.unpriced_open_days = bestUnpriced;
    result.min_stay_set = minStaySet;
    result.min_stay_days = minStayDates.size;
    result.ok = bestRun >= RU_MIN_BOOKABLE_WINDOW;
    return result;
  } catch (e) {
    console.warn("[ruLocalWindow] local window probe failed:", e instanceof Error ? e.message : e);
    return result;
  }
}
