import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countedGuests, resolveBookingCapacity } from "./bookingCapacity.ts";

Deno.test("booked room capacity wins over a stale property maximum", () => {
  assertEquals(resolveBookingCapacity(
    [{ room_type_id: "albatros", status: "active" }],
    [{ id: "albatros", max_occupancy: 4 }],
    "albatros",
    2,
  ), 4);
});

Deno.test("multi-room capacity is summed and cancelled lines are ignored", () => {
  assertEquals(resolveBookingCapacity(
    [
      { room_type_id: "double", status: "active" },
      { room_type_id: "family", status: "active" },
      { room_type_id: "family", status: "cancelled" },
    ],
    [{ id: "double", max_occupancy: 2 }, { id: "family", max_occupancy: 4 }],
    null,
    3,
  ), 6);
});

Deno.test("property maximum is used only when allocated capacity is unknown", () => {
  assertEquals(resolveBookingCapacity([{ room_type_id: "legacy" }], [], "legacy", 2), 2);
});

Deno.test("infants are not counted in sleeping capacity", () => {
  assertEquals(countedGuests({ adults: 2, children: 1, teens: 1 }), 4);
});
