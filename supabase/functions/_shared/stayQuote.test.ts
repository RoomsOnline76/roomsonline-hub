import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizePricingInputs,
  stayQuote,
  stayTotalForModel,
  type FspCell,
  type LosRung,
  type PricingInputs,
  type PricingRatePlan,
} from "./ratePricing.ts";
import type { UnitRateContext } from "./rateResolution.ts";

// ---------------------------------------------------------------------------
// Fixtures — one Calendar season, one unit, an authored plan season rate so the
// nightly series is fully covered without touching any legacy store.
// ---------------------------------------------------------------------------

const SEASON_ID = "season-spring";
const PLAN_ID = "plan-standard";
const ROLOS_ID = "rolos-hut";

const hut: UnitRateContext = { id: "unit-hut", name: "Fonteinhutte", linked_rolos_id: ROLOS_ID };

function plan(overrides: Partial<PricingRatePlan> = {}): PricingRatePlan {
  return {
    rate_plan_id: PLAN_ID,
    base_rate: 1000,
    pricing_model: "per_room",
    is_active: true,
    derivation_rounding: "none",
    ...overrides,
  };
}

function inputs(
  p: PricingRatePlan,
  extra: { losRungs?: LosRung[]; fspCells?: FspCell[]; seasonTo?: string } = {},
): PricingInputs {
  return normalizePricingInputs({
    seasons: [
      { id: SEASON_ID, min_stay: 1, periods: [{ from: "2026-09-01", to: extra.seasonTo ?? "2026-09-30" }] },
    ],
    seasonRateKeys: { "unit-hut": [ROLOS_ID, "unit-hut"] },
    ratePlans: { [ROLOS_ID]: p },
    planSeasonRates: {
      [ROLOS_ID]: [{ calendar_season_id: SEASON_ID, base_rate: 1000, extra_adult_rate: 400 }],
    },
    losRungs: extra.losRungs ? { [ROLOS_ID]: extra.losRungs } : undefined,
    fspCells: extra.fspCells ? { [ROLOS_ID]: extra.fspCells } : undefined,
  });
}

const stay3 = { from: "2026-09-10", to: "2026-09-12", adults: 2 };

// ---------------------------------------------------------------------------
// 1. Empty config == today's numbers
// ---------------------------------------------------------------------------

Deno.test("empty LOS/FSP: 3-night per_room stay equals stayTotalForModel", () => {
  const p = plan();
  const q = stayQuote(inputs(p), hut, p, stay3);
  assertEquals(q.shape, "nightly");
  assertEquals(q.nights, 3);
  assertEquals(q.nightly, [1000, 1000, 1000]);
  assertEquals(q.stay_total, stayTotalForModel("per_room", { nightlyRates: [1000, 1000, 1000], adults: 2 }));
  assertEquals(q.stay_total, 3000);
  assertEquals(q.display_per_night, 1000);
});

Deno.test("empty LOS/FSP: per_person stay equals stayTotalForModel", () => {
  const p = plan({ pricing_model: "per_person" });
  const q = stayQuote(inputs(p), hut, p, stay3);
  assertEquals(q.shape, "nightly");
  assertEquals(
    q.stay_total,
    stayTotalForModel("per_person", { nightlyRates: [1000, 1000, 1000], adults: 2 }),
  );
  assertEquals(q.stay_total, 6000);
});

// ---------------------------------------------------------------------------
// 2. LOS
// ---------------------------------------------------------------------------

const rung = (over: Partial<LosRung> = {}): LosRung => ({
  nights: 3,
  derivation_type: "percent",
  derivation_value: -10,
  calendar_season_id: SEASON_ID,
  ...over,
});

Deno.test("LOS enabled: 3-night rung at -10% derives every nightly", () => {
  const p = plan({ los_enabled: true });
  const q = stayQuote(inputs(p, { losRungs: [rung()] }), hut, p, stay3);
  assertEquals(q.shape, "los_nightly");
  assertEquals(q.source, "los_derived");
  assertEquals(q.nightly, [900, 900, 900]);
  assertEquals(q.stay_total, 2700);
});

Deno.test("LOS enabled: a 2-night stay does not reach the 3-night rung", () => {
  const p = plan({ los_enabled: true });
  const q = stayQuote(inputs(p, { losRungs: [rung()] }), hut, p, { from: "2026-09-10", to: "2026-09-11", adults: 2 });
  assertEquals(q.shape, "nightly");
  assertEquals(q.stay_total, 2000);
});

Deno.test("LOS enabled: highest matching threshold wins", () => {
  const p = plan({ los_enabled: true });
  const i = inputs(p, {
    losRungs: [rung({ nights: 3, derivation_value: -10 }), rung({ nights: 5, derivation_value: -20 })],
  });
  const q = stayQuote(i, hut, p, { from: "2026-09-10", to: "2026-09-16", adults: 2 });
  assertEquals(q.shape, "los_nightly");
  assertEquals(q.nightly, [800, 800, 800, 800, 800, 800, 800]);
  assertEquals(q.stay_total, 5600);
});

Deno.test("LOS pinned 7-night rate still runs through the occupancy model", () => {
  const p = plan({ los_enabled: true, pricing_model: "per_person" });
  const i = inputs(p, { losRungs: [rung({ nights: 7, is_pinned: true, pinned_rate: 700 })] });
  const q = stayQuote(i, hut, p, { from: "2026-09-10", to: "2026-09-16", adults: 3 });
  assertEquals(q.shape, "los_nightly");
  assertEquals(q.source, "los_pinned");
  assertEquals(q.nightly, [700, 700, 700, 700, 700, 700, 700]);
  assertEquals(q.stay_total, 700 * 3 * 7);
});

Deno.test("los_enabled=false ignores rungs entirely", () => {
  const p = plan({ los_enabled: false });
  const q = stayQuote(inputs(p, { losRungs: [rung()] }), hut, p, stay3);
  assertEquals(q.shape, "nightly");
  assertEquals(q.stay_total, 3000);
});

// ---------------------------------------------------------------------------
// 3. Full Stay
// ---------------------------------------------------------------------------

const cell = (over: Partial<FspCell> = {}): FspCell => ({
  nights: 7,
  nr_of_guests: 2,
  is_pinned: true,
  pinned_total: 11200,
  calendar_season_id: SEASON_ID,
  ...over,
});

Deno.test("FSP enabled: pinned 7x2 cell quotes a stay total with no nightly series", () => {
  const p = plan({ fsp_enabled: true });
  const q = stayQuote(inputs(p, { fspCells: [cell()] }), hut, p, {
    from: "2026-09-10",
    to: "2026-09-16",
    adults: 2,
  });
  assertEquals(q.shape, "full_stay");
  assertEquals(q.source, "fsp_pinned");
  assertEquals(q.nightly, null);
  assertEquals(q.stay_total, 11200);
  assertEquals(q.display_per_night, 1600);
});

Deno.test("FSP enabled: derived cell applies to the daily stay total", () => {
  const p = plan({ fsp_enabled: true });
  const i = inputs(p, {
    fspCells: [cell({ is_pinned: false, pinned_total: null, derivation_type: "percent", derivation_value: -15 })],
  });
  const q = stayQuote(i, hut, p, { from: "2026-09-10", to: "2026-09-16", adults: 2 });
  assertEquals(q.shape, "full_stay");
  assertEquals(q.source, "fsp_derived");
  assertEquals(q.stay_total, 5950); // 7 x 1000 x 0.85
});

Deno.test("FSP enabled: no matching cell falls back to nightly", () => {
  const p = plan({ fsp_enabled: true });
  const q = stayQuote(inputs(p, { fspCells: [cell()] }), hut, p, stay3);
  assertEquals(q.shape, "nightly");
  assertEquals(q.stay_total, 3000);
});

Deno.test("fsp_enabled=false ignores cells entirely", () => {
  const p = plan({ fsp_enabled: false });
  const q = stayQuote(inputs(p, { fspCells: [cell()] }), hut, p, {
    from: "2026-09-10",
    to: "2026-09-16",
    adults: 2,
  });
  assertEquals(q.shape, "nightly");
  assertEquals(q.stay_total, 7000);
});

// ---------------------------------------------------------------------------
// 4. Coverage wins over everything
// ---------------------------------------------------------------------------

Deno.test("one unpriced night makes the stay unpriced, even with a matching FSP cell", () => {
  const p = plan({ fsp_enabled: true, base_rate: 0 });
  // Season ends 2026-09-11 so the third night has no tier at all.
  const i = inputs(p, {
    seasonTo: "2026-09-11",
    fspCells: [cell({ nights: 3, pinned_total: 9999 })],
  });
  const q = stayQuote(i, hut, p, stay3);
  assertEquals(q.shape, "nightly");
  assertEquals(q.stay_total, 0);
  assertEquals(q.nightly, []);
});
