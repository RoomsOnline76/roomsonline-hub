import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyDifferential,
  normalizePricingInputs,
  resolveNightRate,
  resolveNightRates,
  resolveStayRules,
  seasonForDate,
  type PricingInputs,
} from "./ratePricing.ts";
import { compressToPeriods, normalizePriceWindow, type DayRate, type UnitRateContext } from "./rateResolution.ts";

// ---------------------------------------------------------------------------
// Fixtures — the Jongensfontein shape: one shared Calendar season, sibling units.
// ---------------------------------------------------------------------------

const SEASON_ID = "season-peak";
const PLAN_ID = "plan-standard";

const hut: UnitRateContext = { id: "unit-hut", name: "Fonteinhutte", linked_rolos_id: "rolos-hut" };
const dassie: UnitRateContext = { id: "unit-dassie", name: "Dassie Single", linked_rolos_id: "rolos-dassie" };

function inputs(partial: Partial<PricingInputs> = {}): PricingInputs {
  return normalizePricingInputs({
    seasons: [
      { id: SEASON_ID, min_stay: 2, periods: [{ from: "2026-12-15", to: "2026-12-31" }] },
    ],
    seasonRateKeys: { "unit-hut": ["rolos-hut", "unit-hut"], "unit-dassie": ["rolos-dassie", "unit-dassie"] },
    ...partial,
  });
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    rate_plan_id: PLAN_ID,
    base_rate: 1000,
    pricing_model: "per_unit",
    is_active: true,
    ...overrides,
  } as PricingInputs["ratePlans"][string];
}

// ---------------------------------------------------------------------------
// 1. Shared season + different unit rates (Jongensfontein case)
// ---------------------------------------------------------------------------

Deno.test("shared Calendar season prices sibling units at their own rates", () => {
  const i = inputs({
    seasonRates: {
      "rolos-hut": { [`${SEASON_ID}-${PLAN_ID}`]: { roomAmount: 2400, adultAmount: 250 } },
      "rolos-dassie": { [`${SEASON_ID}-${PLAN_ID}`]: { roomAmount: 1350, adultAmount: 180 } },
    },
    ratePlans: { "rolos-hut": plan(), "rolos-dassie": plan() },
  });

  const hutDay = resolveNightRate(i, hut, "2026-12-20");
  const dassieDay = resolveNightRate(i, dassie, "2026-12-20");

  assertEquals(hutDay, { date: "2026-12-20", price: 2400, extra_guest_price: 250, source: "calendar_season", season_name: undefined });
  assertEquals(dassieDay, { date: "2026-12-20", price: 1350, extra_guest_price: 180, source: "calendar_season", season_name: undefined });
});

Deno.test("shared season with a single plan rate + per-unit differentials", () => {
  // One shared season priced once on the plan; each unit carries its own differential.
  const i = inputs({
    ratePlans: {
      "rolos-hut": plan({ differential_type: "amount", differential_value: 400 }),
      "rolos-dassie": plan({ differential_type: "percent", differential_value: -25 }),
    },
    planSeasonRates: {
      "rolos-hut": [{ calendar_season_id: SEASON_ID, base_rate: 2000 }],
      "rolos-dassie": [{ calendar_season_id: SEASON_ID, base_rate: 2000 }],
    },
  });

  assertEquals(resolveNightRate(i, hut, "2026-12-20")?.price, 2400);
  assertEquals(resolveNightRate(i, dassie, "2026-12-20")?.price, 1500);
  assertEquals(resolveNightRate(i, hut, "2026-12-20")?.source, "plan_season");
});

// ---------------------------------------------------------------------------
// 2. Base rate only
// ---------------------------------------------------------------------------

Deno.test("base rate only — every night at the rate plan base rate", () => {
  const i = normalizePricingInputs({ ratePlans: { "rolos-hut": plan({ base_rate: 850, extra_adult_rate: 120 }) } });
  const days = resolveNightRates(i, hut, "2026-03-01", "2026-03-03");

  assertEquals(days.length, 3);
  assertEquals(days.map((d) => d.price), [850, 850, 850]);
  assertEquals(new Set(days.map((d) => d.source)), new Set(["rack_rate"]));
  assertEquals(days[0].extra_guest_price, 120);
  // Contiguous identical nights compress into one outbound period.
  assertEquals(compressToPeriods(days).length, 1);
});

Deno.test("base rate with a unit differential", () => {
  const i = normalizePricingInputs({
    ratePlans: { "rolos-hut": plan({ base_rate: 1000, differential_type: "percent", differential_value: 12.5 }) },
  });
  assertEquals(resolveNightRate(i, hut, "2026-03-01")?.price, 1125);
});

// ---------------------------------------------------------------------------
// 3. Season override
// ---------------------------------------------------------------------------

Deno.test("plan season rate beats the base rate and beats the legacy calendar season rate", () => {
  const withPlanSeason = inputs({
    ratePlans: { "rolos-hut": plan({ base_rate: 900 }) },
    planSeasonRates: { "rolos-hut": [{ calendar_season_id: SEASON_ID, base_rate: 1800 }] },
  });
  assertEquals(resolveNightRate(withPlanSeason, hut, "2026-12-20")?.price, 1800);
  assertEquals(resolveNightRate(withPlanSeason, hut, "2026-12-20")?.source, "plan_season");
  // Outside the season the base rate applies again.
  assertEquals(resolveNightRate(withPlanSeason, hut, "2026-11-20")?.source, "rack_rate");
  assertEquals(resolveNightRate(withPlanSeason, hut, "2026-11-20")?.price, 900);

  const withCalendar = inputs({
    seasonRates: { "rolos-hut": { [`${SEASON_ID}-${PLAN_ID}`]: { roomAmount: 2100 } } },
    ratePlans: { "rolos-hut": plan({ base_rate: 900 }) },
    planSeasonRates: { "rolos-hut": [{ calendar_season_id: SEASON_ID, base_rate: 1800 }] },
  });
  assertEquals(resolveNightRate(withCalendar, hut, "2026-12-20")?.price, 1800);
  assertEquals(resolveNightRate(withCalendar, hut, "2026-12-20")?.source, "plan_season");
});

Deno.test("plan season differential is computed off the plan base rate", () => {
  const i = inputs({
    ratePlans: { "rolos-hut": plan({ base_rate: 1000 }) },
    planSeasonRates: { "rolos-hut": [{ calendar_season_id: SEASON_ID, differential_type: "percent", differential_value: 40 }] },
  });
  assertEquals(resolveNightRate(i, hut, "2026-12-20")?.price, 1400);
});

Deno.test("relational season sits below the plan season and above the rack rate", () => {
  const i = normalizePricingInputs({
    ratePlans: { "rolos-hut": plan({ base_rate: 900 }) },
    relationalSeasonRates: {
      "rolos-hut": [{ start_date: "2026-07-01", end_date: "2026-07-31", base_rate: 1150, extra_adult_rate: 200 }],
    },
  });
  assertEquals(resolveNightRate(i, hut, "2026-07-10")?.source, "relational_season");
  assertEquals(resolveNightRate(i, hut, "2026-07-10")?.price, 1150);
  assertEquals(resolveNightRate(i, hut, "2026-08-10")?.source, "rack_rate");
});

// ---------------------------------------------------------------------------
// 4. Daily manual override
// ---------------------------------------------------------------------------

Deno.test("a Calendar daily override wins over every other tier", () => {
  const i = inputs({
    seasonRates: { "rolos-hut": { [`${SEASON_ID}-${PLAN_ID}`]: { roomAmount: 2100 } } },
    ratePlans: { "rolos-hut": plan({ base_rate: 900, differential_type: "amount", differential_value: 500 }) },
    planSeasonRates: { "rolos-hut": [{ calendar_season_id: SEASON_ID, base_rate: 1800 }] },
    dailyOverrides: { "rolos-hut": { "2026-12-20": { price: 3500, extra_guest_price: 400 } } },
  });

  const days = resolveNightRates(i, hut, "2026-12-19", "2026-12-21");
  assertEquals(days.map((d) => [d.date, d.price, d.source]), [
    ["2026-12-19", 2300, "plan_season"],
    ["2026-12-20", 3500, "daily_override"],
    ["2026-12-21", 2300, "plan_season"],
  ]);
  // The override is final — the unit differential must NOT be applied to it.
  assertEquals(days[1].extra_guest_price, 400);
});

Deno.test("a plan-scoped daily override only prices that plan, and beats the plan-agnostic one", () => {
  const base = {
    ratePlans: { "rolos-hut": plan({ base_rate: 900 }) },
    dailyOverrides: { "rolos-hut": { "2026-12-20": { price: 3500 } } },
  };
  // Scoped to the plan being priced: it wins.
  const mine = inputs({ ...base, planDailyOverrides: { [PLAN_ID]: { "rolos-hut": { "2026-12-20": { price: 4200 } } } } });
  assertEquals(resolveNightRate(mine, hut, "2026-12-20")?.price, 4200);
  // Scoped to another plan: ignored, the plan-agnostic override still applies.
  const other = inputs({ ...base, planDailyOverrides: { "other-plan": { "rolos-hut": { "2026-12-20": { price: 4200 } } } } });
  assertEquals(resolveNightRate(other, hut, "2026-12-20")?.price, 3500);
});

Deno.test("an override with no usable price does not blank the night", () => {
  const i = inputs({
    ratePlans: { "rolos-hut": plan({ base_rate: 900 }) },
    dailyOverrides: { "rolos-hut": { "2026-03-02": { price: 0, min_stay: 4 } } },
  });
  assertEquals(resolveNightRate(i, hut, "2026-03-02")?.price, 900);
  assertEquals(resolveNightRate(i, hut, "2026-03-02")?.source, "rack_rate");
});

// ---------------------------------------------------------------------------
// 5. Min/max stay coming from the Rate Plan
// ---------------------------------------------------------------------------

Deno.test("min/max stay comes from the Rate Plan and beats the Calendar season", () => {
  const i = inputs({ ratePlans: { "rolos-hut": plan({ min_stay: 3, max_stay: 14 }) } });
  const rules = resolveStayRules(i, hut, "2026-12-18", "2026-12-21");
  assertEquals(rules.min_stay, 3); // plan 3 beats the season's 2
  assertEquals(rules.max_stay, 14);
});

Deno.test("stay rules cascade: override > plan season > plan > Calendar season > default", () => {
  const base = inputs({ ratePlans: { "rolos-hut": plan({ min_stay: 3 }) } });
  assertEquals(resolveStayRules(base, hut, "2026-12-18", "2026-12-20").min_stay, 3);

  const withPlanSeason = inputs({
    ratePlans: { "rolos-hut": plan({ min_stay: 3 }) },
    planSeasonRates: { "rolos-hut": [{ calendar_season_id: SEASON_ID, base_rate: 1800, min_stay: 5, max_stay: 10 }] },
  });
  const planSeasonRules = resolveStayRules(withPlanSeason, hut, "2026-12-18", "2026-12-20");
  assertEquals(planSeasonRules.min_stay, 5);
  assertEquals(planSeasonRules.max_stay, 10);

  const withOverride = inputs({
    ratePlans: { "rolos-hut": plan({ min_stay: 3 }) },
    dailyOverrides: { "rolos-hut": { "2026-12-18": { min_stay: 7, closed_to_arrival: true } } },
  });
  const overrideRules = resolveStayRules(withOverride, hut, "2026-12-18", "2026-12-20");
  assertEquals(overrideRules.min_stay, 7);
  assertEquals(overrideRules.closed_to_arrival, true);

  // No plan, no override: the Calendar season min stay applies.
  assertEquals(resolveStayRules(inputs(), hut, "2026-12-18", "2026-12-20").min_stay, 2);
  // Outside every season: default 1, unbounded.
  const off = resolveStayRules(inputs(), hut, "2026-05-01", "2026-05-03");
  assertEquals(off.min_stay, 1);
  assertEquals(off.max_stay, null);
});

// ---------------------------------------------------------------------------
// 6. Inactive Rate Plan
// ---------------------------------------------------------------------------

Deno.test("an inactive Rate Plan is skipped and pricing falls through", () => {
  const i = inputs({
    ratePlans: { "rolos-hut": plan({ base_rate: 900, is_active: false }) },
    planSeasonRates: { "rolos-hut": [{ calendar_season_id: SEASON_ID, base_rate: 1800 }] },
    unitDailyRates: { "unit-hut": 640 },
  });

  // Inside the season: the plan season rate belongs to the inactive plan, so it is ignored.
  assertEquals(resolveNightRate(i, hut, "2026-12-20"), { date: "2026-12-20", price: 640, source: "unit_daily_rate" });
  // Outside the season: same fallback.
  assertEquals(resolveNightRate(i, hut, "2026-06-01")?.source, "unit_daily_rate");
  // An authored Calendar season rate still prices the night — the Calendar is independent.
  const withCalendar = inputs({
    seasonRates: { "rolos-hut": { [`${SEASON_ID}-x`]: { roomAmount: 2100 } } },
    ratePlans: { "rolos-hut": plan({ is_active: false }) },
  });
  assertEquals(resolveNightRate(withCalendar, hut, "2026-12-20")?.source, "calendar_season");
  // An inactive plan never contributes stay rules.
  assertEquals(resolveStayRules(i, hut, "2026-06-01", "2026-06-02").min_stay, 1);
});

// ---------------------------------------------------------------------------
// 7. Missing season fallback
// ---------------------------------------------------------------------------

Deno.test("missing season leaves the night unpriced rather than pricing it at zero", () => {
  const i = inputs({
    seasonRates: { "rolos-hut": { [`${SEASON_ID}-${PLAN_ID}`]: { roomAmount: 2100 } } },
  });
  // No plan, no relational rate, no unit daily rate: nights outside the season are omitted.
  const days = resolveNightRates(i, hut, "2026-12-30", "2027-01-02");
  assertEquals(days.map((d) => d.date), ["2026-12-30", "2026-12-31"]);
  assert(days.every((d) => d.price > 0));

  const normalised = normalizePriceWindow(days as DayRate[], "2026-12-30", "2027-01-02");
  assertEquals(normalised.unpriced_dates, ["2027-01-01", "2027-01-02"]);
  assertEquals(normalised.expected_days, 4);
});

Deno.test("no seasons configured at all still prices from the plan", () => {
  const i = normalizePricingInputs({ ratePlans: { "rolos-hut": plan({ base_rate: 700 }) } });
  assertEquals(seasonForDate(i.seasons, "2026-12-20"), null);
  assertEquals(resolveNightRate(i, hut, "2026-12-20")?.price, 700);
});

Deno.test("a season with no authored rate falls through to the plan season, then the plan", () => {
  const i = inputs({
    seasonRates: {},
    ratePlans: { "rolos-hut": plan({ base_rate: 900 }) },
  });
  assertEquals(resolveNightRate(i, hut, "2026-12-20")?.source, "rack_rate");
  assertEquals(resolveNightRate(i, hut, "2026-12-20")?.price, 900);
});

// ---------------------------------------------------------------------------
// 8. Purity guard + differential arithmetic
// ---------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !(value instanceof Set)) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

Deno.test("the resolver is pure — frozen inputs are never mutated", () => {
  const i = deepFreeze(inputs({
    seasonRates: { "rolos-hut": { [`${SEASON_ID}-${PLAN_ID}`]: { roomAmount: 2100 } } },
    ratePlans: { "rolos-hut": plan({ base_rate: 900 }) },
    planSeasonRates: { "rolos-hut": [{ calendar_season_id: SEASON_ID, base_rate: 1800 }] },
    dailyOverrides: { "rolos-hut": { "2026-12-20": { price: 3500 } } },
    unitDailyRates: { "unit-hut": 500 },
  }));

  const snapshot = JSON.stringify(i, (_k, v) => (v instanceof Set ? [...v] : v));
  const first = resolveNightRates(i, hut, "2026-12-18", "2026-12-22");
  const second = resolveNightRates(i, hut, "2026-12-18", "2026-12-22");
  resolveStayRules(i, hut, "2026-12-18", "2026-12-22");

  // Deterministic, and the inputs are untouched.
  assertEquals(first, second);
  assertEquals(JSON.stringify(i, (_k, v) => (v instanceof Set ? [...v] : v)), snapshot);
});

Deno.test("differential arithmetic", () => {
  assertEquals(applyDifferential(1000, "none", 500), 1000);
  assertEquals(applyDifferential(1000, undefined, 500), 1000);
  assertEquals(applyDifferential(1000, "amount", 250), 1250);
  assertEquals(applyDifferential(1000, "amount", -250), 750);
  assertEquals(applyDifferential(1000, "percent", 10), 1100);
  assertEquals(applyDifferential(1000, "percent", -10), 900);
  assertEquals(applyDifferential(999.99, "percent", 7.5), 1074.99);
  // A differential that would zero or invert the rate is ignored.
  assertEquals(applyDifferential(1000, "amount", -1000), 1000);
  assertEquals(applyDifferential(1000, "percent", -150), 1000);
});
