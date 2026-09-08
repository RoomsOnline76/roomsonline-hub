import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sweepStaleRuHolds } from "./ruStaleHoldSweep.ts";

interface Candidate {
  id: string;
  external_reservation_id: string;
  property_id: string | null;
  status: string;
  check_in_date: string;
  check_out_date: string;
  created_at: string;
}

const candidate: Candidate = {
  id: "booking-1",
  external_reservation_id: "147176019",
  property_id: "prop-1",
  status: "pending",
  check_in_date: "2099-01-01",
  check_out_date: "2099-01-03",
  created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
};

// deno-lint-ignore no-explicit-any
function fakeDb(candidates: Candidate[], updates: Record<string, unknown>[]): any {
  const bookingsChain = () => {
    // deno-lint-ignore no-explicit-any
    const chain: any = {};
    for (const key of ["select", "in", "not", "gte", "or", "order", "eq"]) chain[key] = () => chain;
    chain.limit = () => Promise.resolve({ data: candidates, error: null });
    chain.update = (payload: Record<string, unknown>) => {
      updates.push(payload);
      return { eq: () => Promise.resolve({ error: null }) };
    };
    return chain;
  };

  const notificationsChain = () => ({
    select: () => ({
      eq: () => ({ gte: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    }),
    insert: () => Promise.resolve({ error: null }),
  });

  return { from: (table: string) => (table === "bookings" ? bookingsChain() : notificationsChain()) };
}

Deno.test("settles a stay the channel no longer holds and releases its nights", async () => {
  const updates: Record<string, unknown>[] = [];
  const released: string[] = [];
  const result = await sweepStaleRuHolds(
    fakeDb([candidate], updates),
    { seenReservationIds: [] },
    {
      refresh: () => Promise.resolve({ outcome: "failed", error: "Reservation does not exist." }),
      release: (_db: unknown, bookingId: string) => {
        released.push(bookingId);
        return Promise.resolve(2);
      },
    },
  );
  assertEquals(result.cancelled, 1);
  assertEquals(updates[0].status, "cancelled");
  assertEquals(updates[0].cancellation_reason, "Cancelled at the Channel Manager");
  assertEquals(released, ["booking-1"]);
});

Deno.test("never cancels on a channel rate refusal", async () => {
  const updates: Record<string, unknown>[] = [];
  const result = await sweepStaleRuHolds(
    fakeDb([candidate], updates),
    { seenReservationIds: [] },
    { refresh: () => Promise.resolve({ outcome: "failed", rateDeferred: true, error: "rate limit" }) },
  );
  assertEquals(result.deferred, 1);
  assertEquals(result.cancelled, 0);
  assertEquals(updates.length, 0);
});

Deno.test("leaves a stay the channel still holds untouched", async () => {
  const updates: Record<string, unknown>[] = [];
  const result = await sweepStaleRuHolds(
    fakeDb([candidate], updates),
    { seenReservationIds: [] },
    { refresh: () => Promise.resolve({ outcome: "updated" }) },
  );
  assertEquals(result.live, 1);
  assertEquals(updates.length, 0);
});

Deno.test("does not verify a reservation the channel returned this run", async () => {
  const updates: Record<string, unknown>[] = [];
  let calls = 0;
  const result = await sweepStaleRuHolds(
    fakeDb([candidate], updates),
    { seenReservationIds: ["147176019"] },
    {
      refresh: () => {
        calls += 1;
        return Promise.resolve({ outcome: "updated" });
      },
    },
  );
  assertEquals(result.verified, 0);
  assertEquals(calls, 0);
});

Deno.test("an unclear channel error is never read as a cancellation", async () => {
  const updates: Record<string, unknown>[] = [];
  const result = await sweepStaleRuHolds(
    fakeDb([candidate], updates),
    { seenReservationIds: [] },
    { refresh: () => Promise.resolve({ outcome: "failed", error: "Unexpected error, contact IT" }) },
  );
  assertEquals(result.inconclusive, 1);
  assertEquals(updates.length, 0);
});
