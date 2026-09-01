import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { applyDerivation, type LosRung } from "./ratePricing.ts";
import { losFingerprint, losPricingForPeriod, splitPeriodsByLos } from "./ruLosPricing.ts";

const rung = (over: Partial<LosRung>): LosRung => ({
  nights: 3,
  derivation_type: "percent",
  derivation_value: -10,
  calendar_season_id: null,
  start_date: null,
  end_date: null,
  room_type_id: null,
  ...over,
});

Deno.test("no rungs → empty ladder", () => {
  assertEquals(
    losPricingForPeriod({
      parentNightly: 1000,
      rungs: [],
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      calendarSeasonId: "s1",
      unitRolosId: "u1",
    }),
    [],
  );
});

Deno.test("3-night -10% derives from the parent nightly", () => {
  const expected = applyDerivation(1000, "percent", -10, null);
  assertEquals(
    losPricingForPeriod({
      parentNightly: 1000,
      rungs: [rung({ calendar_season_id: "s1" })],
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      calendarSeasonId: "s1",
      unitRolosId: "u1",
    }),
    [{ nights: 3, price: expected as number }],
  );
});

Deno.test("season-bound rung skipped when the period's season differs", () => {
  assertEquals(
    losPricingForPeriod({
      parentNightly: 1000,
      rungs: [rung({ calendar_season_id: "s1" })],
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      calendarSeasonId: "s2",
      unitRolosId: "u1",
    }),
    [],
  );
});

Deno.test("dated rung only partially overlapping the period does not attach", () => {
  assertEquals(
    losPricingForPeriod({
      parentNightly: 1000,
      rungs: [rung({ start_date: "2026-01-01", end_date: "2026-01-15" })],
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      calendarSeasonId: null,
      unitRolosId: "u1",
    }),
    [],
  );
});

Deno.test("two thresholds both publish, ascending", () => {
  const ladder = losPricingForPeriod({
    parentNightly: 1000,
    rungs: [
      rung({ nights: 7, calendar_season_id: "s1", derivation_value: -20 }),
      rung({ nights: 3, calendar_season_id: "s1" }),
    ],
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    calendarSeasonId: "s1",
    unitRolosId: "u1",
  });
  assertEquals(ladder.map((l) => l.nights), [3, 7]);
});

Deno.test("pinned rung publishes the pin, not a derivation", () => {
  assertEquals(
    losPricingForPeriod({
      parentNightly: 1000,
      rungs: [rung({ calendar_season_id: "s1", is_pinned: true, pinned_rate: 850 })],
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      calendarSeasonId: "s1",
      unitRolosId: "u1",
    }),
    [{ nights: 3, price: 850 }],
  );
});

Deno.test("rung for another unit is ignored", () => {
  assertEquals(
    losPricingForPeriod({
      parentNightly: 1000,
      rungs: [rung({ calendar_season_id: "s1", room_type_id: "other" })],
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      calendarSeasonId: "s1",
      unitRolosId: "u1",
    }),
    [],
  );
});

Deno.test("periods split where the ladder changes mid-range", () => {
  const split = splitPeriodsByLos(
    [{ date_from: "2026-01-01", date_to: "2026-01-04", price: 1000 }],
    (date) => (date < "2026-01-03" ? [{ nights: 3, price: 900 }] : []),
  );
  assertEquals(split.map((p) => [p.date_from, p.date_to, losFingerprint(p.los_pricing ?? [])]), [
    ["2026-01-01", "2026-01-02", "3:900"],
    ["2026-01-03", "2026-01-04", ""],
  ]);
});
