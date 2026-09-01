import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { applyDerivation, type FspCell } from "./ratePricing.ts";
import { convertFspSeasons, fspSeasonForNight } from "./ruFspPricing.ts";

const cell = (over: Partial<FspCell>): FspCell => ({
  nights: 7,
  nr_of_guests: 2,
  derivation_type: "percent",
  derivation_value: -10,
  calendar_season_id: "s1",
  start_date: null,
  end_date: null,
  room_type_id: null,
  ...over,
});

Deno.test("no cells → DefaultPrice only", () => {
  assertEquals(
    fspSeasonForNight({
      date: "2026-02-01",
      parentNightly: 2000,
      cells: [],
      calendarSeasonId: "s1",
      unitRolosId: "u1",
    }),
    { date: "2026-02-01", default_price: 2000, rows: [] },
  );
});

Deno.test("unpriced night → null", () => {
  assertEquals(
    fspSeasonForNight({
      date: "2026-02-01",
      parentNightly: 0,
      cells: [cell({})],
      calendarSeasonId: "s1",
      unitRolosId: "u1",
    }),
    null,
  );
});

Deno.test("pinned 7-night x 2-guest cell publishes the pinned stay total", () => {
  assertEquals(
    fspSeasonForNight({
      date: "2026-02-01",
      parentNightly: 2000,
      cells: [cell({ is_pinned: true, pinned_total: 12600 })],
      calendarSeasonId: "s1",
      unitRolosId: "u1",
    }),
    {
      date: "2026-02-01",
      default_price: 2000,
      rows: [{ nr_of_guests: 2, prices: [{ nr_of_nights: 7, price: 12600 }] }],
    },
  );
});

Deno.test("derived cell uses the engine derivation on the whole stay", () => {
  const expected = applyDerivation(2000 * 7, "percent", -10, null);
  const season = fspSeasonForNight({
    date: "2026-02-01",
    parentNightly: 2000,
    cells: [cell({})],
    calendarSeasonId: "s1",
    unitRolosId: "u1",
  });
  assertEquals(season?.rows, [{ nr_of_guests: 2, prices: [{ nr_of_nights: 7, price: expected as number }] }]);
});

Deno.test("season mismatch omits the cell but keeps the default", () => {
  assertEquals(
    fspSeasonForNight({
      date: "2026-02-01",
      parentNightly: 2000,
      cells: [cell({})],
      calendarSeasonId: "s2",
      unitRolosId: "u1",
    }),
    { date: "2026-02-01", default_price: 2000, rows: [] },
  );
});

Deno.test("cell scoped to another unit is ignored", () => {
  assertEquals(
    fspSeasonForNight({
      date: "2026-02-01",
      parentNightly: 2000,
      cells: [cell({ room_type_id: "other" })],
      calendarSeasonId: "s1",
      unitRolosId: "u1",
    })?.rows,
    [],
  );
});

Deno.test("rows and prices sorted ascending", () => {
  const season = fspSeasonForNight({
    date: "2026-02-01",
    parentNightly: 1000,
    cells: [
      cell({ nights: 5, nr_of_guests: 4, is_pinned: true, pinned_total: 5000 }),
      cell({ nights: 3, nr_of_guests: 4, is_pinned: true, pinned_total: 3000 }),
      cell({ nights: 3, nr_of_guests: 2, is_pinned: true, pinned_total: 2800 }),
    ],
    calendarSeasonId: "s1",
    unitRolosId: "u1",
  });
  assertEquals(season?.rows.map((r) => [r.nr_of_guests, r.prices.map((p) => p.nr_of_nights)]), [
    [2, [3]],
    [4, [3, 5]],
  ]);
});

Deno.test("FX helper scales the default and every cell", () => {
  assertEquals(
    convertFspSeasons(
      [{ date: "2026-02-01", default_price: 100, rows: [{ nr_of_guests: 2, prices: [{ nr_of_nights: 3, price: 270 }] }] }],
      2,
    ),
    [{ date: "2026-02-01", default_price: 200, rows: [{ nr_of_guests: 2, prices: [{ nr_of_nights: 3, price: 540 }] }] }],
  );
});
