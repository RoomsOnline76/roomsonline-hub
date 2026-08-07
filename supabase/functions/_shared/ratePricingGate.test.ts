/**
 * Merge-gate tests for the effective-rate calculation that were not already
 * covered by ratePricing.test.ts: tier precedence end to end, unit
 * differentials stacking on plan-derived tiers only, inactive plans, stay-rule
 * cascade and unpriced-night behaviour.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyDifferential,
  normalizePricingInputs,
  resolveNightRate,
  resolveNightRates,
  resolveStayRules,
  isClosed,
  type PricingInputs,
} from "./ratePricing.ts";
import type { UnitRateContext } from "./rateResolution.ts";

const UNIT: UnitRateContext = { id: "unit-1", name: "ELF", linked_rolos_id: "rolos-1" };

const SEASONS = [{ id: "high", min_stay: 3, periods: [{ from: "2026-12-11", to: "2027-01-03" }] }];

function inputs(over: Partial<PricingInputs> = {}): PricingInputs {
  return normalizePricingInputs({
    seasons: SEASONS,
    ratePlans: {
      "rolos-1": {
        rate_plan_id: "plan-1",
        base_rate: 1000,
        pricing_model: "per_room",
        is_active: true,
        min_stay: 2,
        max_stay: 30,
      },
    },
    unitDailyRates: { "unit-1": 700 },
    ...over,
  });
}

const price = (i: PricingInputs, date: string) => resolveNightRate(i, UNIT, date);

Deno.test("tier 1 beats everything: a daily override wins over an in-season calendar rate", () => {
  const i = inputs({
    seasonRates: { "unit-1": { "high-plan-1": { roomAmount: 2000 } } },
    seasonRateKeys: { "unit-1": ["unit-1"] },
    dailyOverrides: { "rolos-1": { "2026-12-20": { price: 3333 } } },
  });
  assertEquals(price(i, "2026-12-20"), { date: "2026-12-20", price: 3333, extra_guest_price: undefined, source: "daily_override" });
  assertEquals(price(i, "2026-12-21")?.source, "calendar_season");
});

Deno.test("tier 2 beats tier 3: an authored calendar season rate wins over a plan season rate", () => {
  const i = inputs({
    seasonRates: { "unit-1": { "high-plan-1": { roomAmount: 2000, adultAmount: 150 } } },
    seasonRateKeys: { "unit-1": ["unit-1"] },
    planSeasonRates: { "rolos-1": [{ calendar_season_id: "high", base_rate: 9999 }] },
  });
  assertEquals(price(i, "2026-12-20"), { date: "2026-12-20", price: 2000, extra_guest_price: 150, source: "calendar_season" });
});

Deno.test("tier 3: plan season absolute rate, then percent, then amount differential off base", () => {
  const abs = inputs({ planSeasonRates: { "rolos-1": [{ calendar_season_id: "high", base_rate: 2500 }] } });
  assertEquals(price(abs, "2026-12-20")?.price, 2500);

  const pct = inputs({
    planSeasonRates: { "rolos-1": [{ calendar_season_id: "high", differential_type: "percent", differential_value: 25 }] },
  });
  assertEquals(price(pct, "2026-12-20"), { date: "2026-12-20", price: 1250, extra_guest_price: undefined, source: "plan_season" });

  const amt = inputs({
    planSeasonRates: { "rolos-1": [{ calendar_season_id: "high", differential_type: "amount", differential_value: 350 }] },
  });
  assertEquals(price(amt, "2026-12-20")?.price, 1350);
});

Deno.test("tier 3: an absolute plan rate takes precedence over its own differential", () => {
  const i = inputs({
    planSeasonRates: {
      "rolos-1": [{ calendar_season_id: "high", base_rate: 2500, differential_type: "percent", differential_value: 50 }],
    },
  });
  assertEquals(price(i, "2026-12-20")?.price, 2500);
});

Deno.test("tier 3: a windowed plan rate applies outside any calendar season", () => {
  const i = inputs({
    planSeasonRates: { "rolos-1": [{ start_date: "2026-09-01", end_date: "2026-09-30", base_rate: 800 }] },
  });
  assertEquals(price(i, "2026-09-15"), { date: "2026-09-15", price: 800, extra_guest_price: undefined, source: "plan_season" });
  assertEquals(price(i, "2026-10-15")?.source, "rack_rate");
});

Deno.test("tier 4 then 5 then 6: relational, rack, unit daily in order", () => {
  const rel = inputs({
    relationalSeasonRates: { "rolos-1": [{ start_date: "2026-10-01", end_date: "2026-10-31", base_rate: 900 }] },
  });
  assertEquals(price(rel, "2026-10-05")?.source, "relational_season");
  assertEquals(price(rel, "2026-11-05")?.source, "rack_rate");

  const noPlan = normalizePricingInputs({ seasons: SEASONS, unitDailyRates: { "unit-1": 700 } });
  assertEquals(price(noPlan, "2026-11-05"), { date: "2026-11-05", price: 700, source: "unit_daily_rate" });
});

Deno.test("unit differentials stack on plan-derived tiers only", () => {
  const withDiff = (over: Partial<PricingInputs>) =>
    inputs({
      ratePlans: {
        "rolos-1": {
          rate_plan_id: "plan-1",
          base_rate: 1000,
          pricing_model: "per_room",
          is_active: true,
          differential_type: "percent",
          differential_value: 10,
        },
      },
      ...over,
    });

  // rack, plan season and relational all take the +10%.
  assertEquals(price(withDiff({}), "2026-11-01")?.price, 1100);
  assertEquals(
    price(withDiff({ planSeasonRates: { "rolos-1": [{ calendar_season_id: "high", base_rate: 2000 }] } }), "2026-12-20")?.price,
    2200,
  );
  assertEquals(
    price(
      withDiff({ relationalSeasonRates: { "rolos-1": [{ start_date: "2026-10-01", end_date: "2026-10-31", base_rate: 1000 }] } }),
      "2026-10-05",
    )?.price,
    1100,
  );

  // Calendar-authored amounts and daily overrides are final — never differentiated.
  assertEquals(
    price(
      withDiff({ seasonRates: { "unit-1": { "high-plan-1": { roomAmount: 2000 } } }, seasonRateKeys: { "unit-1": ["unit-1"] } }),
      "2026-12-20",
    )?.price,
    2000,
  );
  assertEquals(price(withDiff({ dailyOverrides: { "unit-1": { "2026-11-01": { price: 500 } } } }), "2026-11-01")?.price, 500);
});

Deno.test("applyDifferential ignores no-op values and never returns a non-positive price", () => {
  assertEquals(applyDifferential(1000, "none", 50), 1000);
  assertEquals(applyDifferential(1000, "amount", 0), 1000);
  assertEquals(applyDifferential(1000, "amount", null), 1000);
  assertEquals(applyDifferential(1000, "amount", -2000), 1000);
  assertEquals(applyDifferential(1000, "percent", -10), 900);
  assertEquals(applyDifferential(1000.005, "amount", 0.001), 1000.01);
});

Deno.test("an inactive rate plan removes tiers 3-5 and falls through to the unit rate", () => {
  const i = inputs({
    ratePlans: {
      "rolos-1": { rate_plan_id: "plan-1", base_rate: 1000, pricing_model: "per_room", is_active: false },
    },
    planSeasonRates: { "rolos-1": [{ calendar_season_id: "high", base_rate: 2500 }] },
    relationalSeasonRates: { "rolos-1": [{ start_date: "2026-10-01", end_date: "2026-10-31", base_rate: 900 }] },
  });
  assertEquals(price(i, "2026-12-20")?.source, "unit_daily_rate");
  assertEquals(price(i, "2026-10-05")?.source, "relational_season"); // legacy tier is not plan-gated
  assertEquals(price(i, "2026-11-05")?.source, "unit_daily_rate");
});

Deno.test("an unpriced night is omitted, never priced at zero", () => {
  const bare = normalizePricingInputs({ seasons: SEASONS });
  assertEquals(price(bare, "2026-11-05"), null);
  const days = resolveNightRates(bare, UNIT, "2026-11-01", "2026-11-05");
  assertEquals(days, []);
});

Deno.test("stay rules take the strictest min and the tightest max across the window", () => {
  const i = inputs({
    planSeasonRates: { "rolos-1": [{ calendar_season_id: "high", base_rate: 2000, min_stay: 5, max_stay: 21 }] },
  });
  // Plan min 2 / max 30, calendar season min 3, plan season min 5 / max 21.
  assertEquals(resolveStayRules(i, UNIT, "2026-12-20", "2026-12-23"), {
    min_stay: 5,
    max_stay: 21,
    closed_to_arrival: false,
    closed_to_departure: false,
  });
  // Out of season: only the plan's own rules apply.
  assertEquals(resolveStayRules(i, UNIT, "2026-11-01", "2026-11-03").min_stay, 2);
});

Deno.test("stay rules honour override CTA/CTD only on the arrival and departure nights", () => {
  const i = inputs({
    dailyOverrides: {
      "rolos-1": {
        "2026-11-01": { closed_to_arrival: true, min_stay: 7 },
        "2026-11-03": { closed_to_departure: true },
      },
    },
  });
  assertEquals(resolveStayRules(i, UNIT, "2026-11-01", "2026-11-03"), {
    min_stay: 7,
    max_stay: 30,
    closed_to_arrival: true,
    closed_to_departure: true,
  });
  // Same overrides, different window: the flags no longer land on the edges.
  const mid = resolveStayRules(i, UNIT, "2026-10-30", "2026-11-05");
  assertEquals([mid.closed_to_arrival, mid.closed_to_departure], [false, false]);
});

Deno.test("stop-sell is matched on either the rolos id or the unit id", () => {
  const byRolos = inputs({ closedDates: { "rolos-1": ["2026-11-01"] } });
  const byUnit = inputs({ closedDates: { "unit-1": new Set(["2026-11-02"]) } });
  assertEquals(isClosed(byRolos, UNIT, "2026-11-01"), true);
  assertEquals(isClosed(byRolos, UNIT, "2026-11-02"), false);
  assertEquals(isClosed(byUnit, UNIT, "2026-11-02"), true);
});

Deno.test("two units on the same shared calendar keep their own prices", () => {
  const other: UnitRateContext = { id: "unit-2", name: "GEELSTERT", linked_rolos_id: "rolos-2" };
  const i = normalizePricingInputs({
    seasons: SEASONS,
    seasonRates: {
      "unit-1": { "high-plan-1": { roomAmount: 1800 } },
      "unit-2": { "high-plan-1": { roomAmount: 2400 } },
    },
    seasonRateKeys: { "unit-1": ["unit-1"], "unit-2": ["unit-2"] },
  });
  assertEquals(resolveNightRate(i, UNIT, "2026-12-20")?.price, 1800);
  assertEquals(resolveNightRate(i, other, "2026-12-20")?.price, 2400);
});
