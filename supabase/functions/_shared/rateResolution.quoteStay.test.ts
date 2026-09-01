import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createRateResolver } from "./rateResolution.ts";
import { stayTotalForModel } from "./ratePricing.ts";

/**
 * Loader-level guardrail for `resolver.quoteStay`. The pure selection order is
 * already frozen by stayQuote.test.ts — here we only prove the wrapper hands the
 * loaded snapshot (flags + ladder rows) to the engine.
 */

const PROPERTY_ID = "prop-1";
const ROLOS_ID = "rolos-hut";
const PLAN_ID = "plan-standard";
const SEASON_ID = "season-spring";

const amenities = {
  seasons: [
    { id: SEASON_ID, name: "Spring", min_stay: 1, periods: [{ from: "2026-09-01", to: "2026-09-30" }] },
  ],
};

type Tables = Record<string, unknown[]>;

/** Minimal thenable query-builder stub: every filter is a no-op, data comes from `tables`. */
// deno-lint-ignore no-explicit-any
function fakeSupabase(tables: Tables): any {
  const build = (table: string) => {
    const rows = tables[table] ?? [];
    const result = { data: rows, error: null };
    const builder: Record<string, unknown> = {
      then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    };
    for (const m of ["select", "eq", "in", "is", "gte", "lte", "neq", "order", "limit", "not"]) {
      builder[m] = () => builder;
    }
    return builder;
  };
  return { from: (table: string) => build(table) };
}

function tablesFor(opts: {
  los_enabled?: boolean;
  fsp_enabled?: boolean;
  rungs?: Record<string, unknown>[];
  cells?: Record<string, unknown>[];
  seasonRate?: number | null;
}): Tables {
  return {
    hostfully_room_types: [
      { id: "unit-hut", name: "Fonteinhutte", linked_rolos_id: ROLOS_ID, daily_rate: null, is_active: true },
    ],
    rolos_rate_plan_room_types: [
      {
        room_type_id: ROLOS_ID,
        rate_plan_id: PLAN_ID,
        is_active: true,
        differential_type: "none",
        differential_value: null,
        rolos_rate_plans: {
          id: PLAN_ID,
          base_rate: 1000,
          pricing_model: "per_room",
          is_active: true,
          derivation_rounding: "none",
          los_enabled: opts.los_enabled ?? false,
          fsp_enabled: opts.fsp_enabled ?? false,
        },
      },
    ],
    rolos_rate_plan_season_rates: opts.seasonRate === null ? [] : [
      {
        rate_plan_id: PLAN_ID,
        room_type_id: null,
        base_rate: opts.seasonRate ?? 1000,
        extra_adult_rate: 400,
        differential_type: "none",
        differential_value: null,
        is_active: true,
        deleted_at: null,
        rolos_shared_seasons: { calendar_season_id: SEASON_ID, start_date: "2026-09-01", end_date: "2026-09-30" },
      },
    ],
    rolos_rate_plan_los_rungs: opts.rungs ?? [],
    rolos_rate_plan_fsp_cells: opts.cells ?? [],
  };
}

const unit = { id: "unit-hut", name: "Fonteinhutte", linked_rolos_id: ROLOS_ID };
const window = { from: "2026-09-10", to: "2026-09-12" };

async function resolverFor(t: Tables) {
  return await createRateResolver(fakeSupabase(t), PROPERTY_ID, { amenities, window, audience: "direct" });
}

Deno.test("quoteStay: flags off equals the summed nightly total", async () => {
  const resolver = await resolverFor(tablesFor({}));
  const nightly = resolver.resolveDays(unit, window.from, window.to).map((d) => d.price);
  const quote = resolver.quoteStay(unit, { from: window.from, to: window.to, adults: 2 });
  assertEquals(quote.shape, "nightly");
  assertEquals(nightly, [1000, 1000, 1000]);
  assertEquals(quote.stay_total, stayTotalForModel("per_room", { nightlyRates: nightly, adults: 2 }));
});

Deno.test("quoteStay: matching LOS rung yields los_nightly", async () => {
  const resolver = await resolverFor(tablesFor({
    los_enabled: true,
    rungs: [{
      rate_plan_id: PLAN_ID,
      room_type_id: null,
      calendar_season_id: SEASON_ID,
      start_date: null,
      end_date: null,
      nights: 3,
      derivation_type: "percent",
      derivation_value: -10,
      is_pinned: false,
      pinned_rate: null,
    }],
  }));
  const quote = resolver.quoteStay(unit, { from: window.from, to: window.to, adults: 2 });
  assertEquals(quote.shape, "los_nightly");
  assertEquals(quote.nightly, [900, 900, 900]);
  assertEquals(quote.stay_total, 2700);
});

Deno.test("quoteStay: matching FSP cell yields full_stay with no nightly series", async () => {
  const resolver = await resolverFor(tablesFor({
    fsp_enabled: true,
    cells: [{
      rate_plan_id: PLAN_ID,
      room_type_id: null,
      calendar_season_id: SEASON_ID,
      start_date: null,
      end_date: null,
      nights: 3,
      nr_of_guests: 2,
      derivation_type: null,
      derivation_value: null,
      is_pinned: true,
      pinned_total: 2400,
    }],
  }));
  const quote = resolver.quoteStay(unit, { from: window.from, to: window.to, adults: 2 });
  assertEquals(quote.shape, "full_stay");
  assertEquals(quote.nightly, null);
  assertEquals(quote.stay_total, 2400);
});

Deno.test("quoteStay: an unpriced night keeps the stay unpriced", async () => {
  const resolver = await resolverFor(tablesFor({
    fsp_enabled: true,
    seasonRate: null,
    cells: [{
      rate_plan_id: PLAN_ID,
      room_type_id: null,
      calendar_season_id: SEASON_ID,
      start_date: null,
      end_date: null,
      nights: 3,
      nr_of_guests: 2,
      derivation_type: null,
      derivation_value: null,
      is_pinned: true,
      pinned_total: 9999,
    }],
  }));
  const quote = resolver.quoteStay(
    { id: "unit-hut", name: "Fonteinhutte", linked_rolos_id: "no-plan" },
    { from: window.from, to: window.to, adults: 2 },
  );
  assertEquals(quote.shape, "nightly");
  assertEquals(quote.stay_total, 0);
});
