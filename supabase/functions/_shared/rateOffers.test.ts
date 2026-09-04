import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { effectiveMinStay, eligibleOffers, offerEligibility, type OfferPlan, type OfferStay } from "./rateOffers.ts";

const UNIT = "unit-1";

const stay = (nights: number, from = "2026-09-10"): OfferStay => {
  const start = new Date(`${from}T00:00:00Z`);
  const last = new Date(start.getTime() + (nights - 1) * 86400000);
  return { from, to: last.toISOString().slice(0, 10), nights, room_type_id: UNIT };
};

const plan = (over: Partial<OfferPlan> = {}): OfferPlan => ({
  rate_plan_id: over.rate_plan_id ?? "p",
  name: over.name ?? "Plan",
  min_stay: over.min_stay ?? null,
  max_stay: over.max_stay ?? null,
  room_type_ids: over.room_type_ids ?? [UNIT],
  windows: over.windows,
});

const bnb = plan({ rate_plan_id: "bnb", name: "Bed & Breakfast Rate" });
const direct = plan({ rate_plan_id: "direct", name: "Book Direct save 15%" });
const twoNights = plan({ rate_plan_id: "two", name: "Stay 2 Nights save 20%", min_stay: 2 });
const threeNights = plan({ rate_plan_id: "three", name: "Book 3 Nights Pay for 2", min_stay: 3 });
const ALL = [bnb, direct, twoNights, threeNights];

Deno.test("one night shows only the no-minimum plans", () => {
  assertEquals(eligibleOffers(ALL, stay(1)).map((p) => p.rate_plan_id), ["bnb", "direct"]);
});

Deno.test("two nights adds the two-night plan", () => {
  assertEquals(eligibleOffers(ALL, stay(2)).map((p) => p.rate_plan_id), ["bnb", "direct", "two"]);
});

Deno.test("three nights shows every plan", () => {
  assertEquals(eligibleOffers(ALL, stay(3)).length, 4);
});

Deno.test("max stay excludes longer stays", () => {
  const capped = plan({ rate_plan_id: "capped", max_stay: 2 });
  assertEquals(offerEligibility(capped, stay(3)).eligible, false);
  assertEquals(offerEligibility(capped, stay(2)).eligible, true);
});

Deno.test("a plan not linked to the unit is never offered", () => {
  assertEquals(offerEligibility(plan({ room_type_ids: ["other"] }), stay(1)).reason, "unit");
});

Deno.test("dated event window raises the minimum only inside the window", () => {
  const event = plan({
    rate_plan_id: "event",
    windows: [{ start_date: "2026-12-12", end_date: "2026-12-14", room_type_id: null, min_stay_nights: 3 }],
  });
  assertEquals(effectiveMinStay(event, stay(2, "2026-09-10")), 1);
  assertEquals(effectiveMinStay(event, stay(2, "2026-12-12")), 3);
  assertEquals(offerEligibility(event, stay(2, "2026-12-12")).eligible, false);
  assertEquals(offerEligibility(event, stay(3, "2026-12-12")).eligible, true);
});

Deno.test("unit-scoped window only binds that unit", () => {
  const event = plan({
    rate_plan_id: "event",
    room_type_ids: [UNIT, "unit-2"],
    windows: [{ start_date: "2026-12-12", end_date: "2026-12-14", room_type_id: "unit-2", min_stay_nights: 3 }],
  });
  assertEquals(offerEligibility(event, stay(2, "2026-12-12")).eligible, true);
  assertEquals(
    offerEligibility(event, { ...stay(2, "2026-12-12"), room_type_id: "unit-2" }).eligible,
    false,
  );
});
