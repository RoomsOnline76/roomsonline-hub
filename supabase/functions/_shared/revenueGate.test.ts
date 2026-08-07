/**
 * Merge-gate tests for the money that sits DOWNSTREAM of a nightly rate:
 * the accommodation / F&B revenue split and the revenue-eligible statuses used
 * by reporting. A rate change must never move how a total is classified.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { breakfastPortion, splitAccommodationAmount, normalizeRevenueStream, normalizeBreakfastBasis } from "./revenueStreams.ts";
import {
  ALL_REVENUE_PAYMENT_STATUSES,
  NON_REVENUE_BOOKING_STATUSES,
  isChannelSettled,
  isRevenuePaymentStatus,
} from "./revenueStatuses.ts";

Deno.test("revenue split: the lines always sum back to the guest total", () => {
  for (const [total, breakfast] of [[1000, 0], [1000, 180], [1000, 1000], [1000, 1500], [999.99, 333.33]]) {
    const lines = splitAccommodationAmount(total, breakfast, { accommodation: "Room", fnb: "Breakfast" });
    const sum = Math.round(lines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
    assertEquals(sum, Math.round(total * 100) / 100, `split of ${total}/${breakfast} did not balance`);
  }
});

Deno.test("revenue split: no F&B means a single accommodation line", () => {
  const lines = splitAccommodationAmount(1000, 0, { accommodation: "Room", fnb: "Breakfast" });
  assertEquals(lines.length, 1);
  assertEquals(lines[0], { stream: "accommodation", amount: 1000, description: "Room" });
});

Deno.test("revenue split: F&B is capped at the total and never negative", () => {
  const lines = splitAccommodationAmount(500, 900, { accommodation: "Room", fnb: "Breakfast" });
  assertEquals(lines, [{ stream: "fnb", amount: 500, description: "Breakfast" }]);
  const negative = splitAccommodationAmount(500, -100, { accommodation: "Room", fnb: "Breakfast" });
  assertEquals(negative, [{ stream: "accommodation", amount: 500, description: "Room" }]);
});

Deno.test("breakfast portion: each basis multiplies by the right dimension", () => {
  const cfg = (basis: string) => ({ included: true, amount: 100, basis } as never);
  assertEquals(breakfastPortion(cfg("per_stay"), { nights: 3, guests: 2, rooms: 2 }), 100);
  assertEquals(breakfastPortion(cfg("per_room_per_night"), { nights: 3, guests: 2, rooms: 2 }), 600);
  assertEquals(breakfastPortion(cfg("per_person_per_night"), { nights: 3, guests: 2, rooms: 2 }), 600);
  assertEquals(breakfastPortion(null, { nights: 3, guests: 2 }), 0);
  assertEquals(breakfastPortion({ included: false, amount: 100, basis: "per_stay" } as never, { nights: 1, guests: 1 }), 0);
});

Deno.test("breakfast portion: zero nights or guests are floored at one", () => {
  const cfg = { included: true, amount: 100, basis: "per_person_per_night" } as never;
  assertEquals(breakfastPortion(cfg, { nights: 0, guests: 0 }), 100);
});

Deno.test("stream and basis normalisation is closed over unknown input", () => {
  assertEquals(normalizeRevenueStream("fnb"), "fnb");
  assertEquals(normalizeRevenueStream("other"), "other");
  // Anything unrecognised stays accommodation, so legacy rows keep their meaning.
  assertEquals(normalizeRevenueStream("food"), "accommodation");
  assertEquals(normalizeRevenueStream(undefined), "accommodation");
  assertEquals(normalizeBreakfastBasis("per_stay"), "per_stay");
  assertEquals(normalizeBreakfastBasis("nonsense"), "per_person_per_night");
});

Deno.test("reporting statuses: paid and partial count, unpaid and cancelled do not", () => {
  assertEquals(isRevenuePaymentStatus("paid"), true);
  assertEquals(isRevenuePaymentStatus("pending"), false);
  assertEquals(isRevenuePaymentStatus(null), false);
  for (const status of ALL_REVENUE_PAYMENT_STATUSES) assertEquals(isRevenuePaymentStatus(status), true);
  for (const status of NON_REVENUE_BOOKING_STATUSES) assertEquals(isRevenuePaymentStatus(status), false);
});

Deno.test("channel-settled bookings are recognised for commission billing", () => {
  assertEquals(isChannelSettled("paid_externally"), true);
  assertEquals(isChannelSettled("paid"), false);
  assertEquals(isChannelSettled(undefined), false);
});
