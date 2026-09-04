import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  eligiblePackage,
  specialDiscount,
  specialIsEligible,
  stayDiscounts,
} from "./stayDiscounts.ts";

const stay = {
  checkIn: "2026-10-01",
  checkOut: "2026-10-04",
  subtotal: 3000,
  now: new Date("2026-09-01T08:00:00Z"),
};

Deno.test("a fixed package price becomes the discount that reaches it", () => {
  const line = eligiblePackage(
    [{ id: "p1", name: "Spring Escape", periodFrom: "2026-09-01", periodTo: "2026-10-31", package_price: 2500 }],
    stay,
  );
  assertEquals(line?.discount, 500);
});

Deno.test("a package whose minimum stay is not met never applies", () => {
  const line = eligiblePackage(
    [{ name: "Long stay", periodFrom: "2026-09-01", periodTo: "2026-10-31", discount_percentage: 10, minimumStay: 5 }],
    stay,
  );
  assertEquals(line, null);
});

Deno.test("specials price off the post-package basis, not the gross", () => {
  const res = stayDiscounts(
    stay,
    [{ name: "Deal", periodFrom: "2026-09-01", periodTo: "2026-10-31", package_price: 2500 }],
    [{ id: "s1", name: "10% off", special_type: "percentage", discount_percent: 10, is_active: true }],
  );
  assertEquals(res.lines.map((l) => l.discount), [500, 250]);
  assertEquals(res.discount_total, 750);
  assertEquals(res.net_total, 2250);
});

Deno.test("only the best non-stackable special applies, stackables add on top", () => {
  const res = stayDiscounts(stay, [], [
    { id: "a", name: "10%", special_type: "percentage", discount_percent: 10 },
    { id: "b", name: "15%", special_type: "percentage", discount_percent: 15 },
    { id: "c", name: "R100 off", special_type: "fixed_amount", fixed_amount: 100, is_stackable: true },
  ]);
  assertEquals(res.lines.map((l) => l.name), ["15%", "R100 off"]);
  assertEquals(res.discount_total, 550);
});

Deno.test("the guest's chosen offer wins over the cheaper best one", () => {
  const res = stayDiscounts(stay, [], [
    { id: "a", name: "10%", special_type: "percentage", discount_percent: 10 },
    { id: "b", name: "15%", special_type: "percentage", discount_percent: 15 },
  ], "a");
  assertEquals(res.lines.map((l) => l.name), ["10%"]);
});

Deno.test("an age-restricted special stays out until proof is shown", () => {
  const special = { id: "s", name: "Pensioner", special_type: "percentage", discount_percent: 20, age_restricted: true };
  assertEquals(specialIsEligible(special, stay), false);
  assertEquals(specialIsEligible(special, { ...stay, ageVerified: true }), true);
});

Deno.test("lead-time and stay-length gates are honoured", () => {
  assertEquals(specialIsEligible({ lead_days_min: 60 }, stay), false);
  assertEquals(specialIsEligible({ lead_days_max: 10 }, stay), false);
  assertEquals(specialIsEligible({ min_stay: 4 }, stay), false);
  assertEquals(specialIsEligible({ max_stay: 2 }, stay), false);
  assertEquals(specialIsEligible({ min_stay: 3, max_stay: 5, lead_days_min: 10 }, stay), true);
});

Deno.test("a room-scoped special skips rooms it does not cover", () => {
  const special = { applicable_room_ids: ["room-1"] };
  assertEquals(specialIsEligible(special, { ...stay, roomIds: ["room-2"] }), false);
  assertEquals(specialIsEligible(special, { ...stay, roomIds: ["room-1"] }), true);
});

Deno.test("a fixed price special drops the basis to that figure", () => {
  assertEquals(specialDiscount({ special_type: "fixed_price", fixed_price: 1800 }, 3000), 1200);
});

Deno.test("discounts never take a stay below zero", () => {
  const res = stayDiscounts({ ...stay, subtotal: 500 }, [], [
    { id: "a", name: "R900 off", special_type: "fixed_amount", fixed_amount: 900 },
  ]);
  assertEquals(res.discount_total, 500);
  assertEquals(res.net_total, 0);
});

Deno.test("no subtotal means no discounts", () => {
  const res = stayDiscounts({ ...stay, subtotal: 0 }, [{ name: "x", periodFrom: "2026-01-01", periodTo: "2026-12-31", package_price: 1 }], []);
  assertEquals(res.discount_total, 0);
  assertEquals(res.net_total, 0);
});
