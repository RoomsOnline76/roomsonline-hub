import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { staticSnapshotHash } from "./ruStaticDelta.ts";

/**
 * The plan hash, the pre-push skip check and the post-success rehash all go through
 * `staticSnapshotHash`, so the same snapshot must always produce the same digest — and a
 * surroundings-only (attractions) or charges-only edit must move it.
 */
const snapshot = () => ({
  property: { name: "RU Test 4", city: "Cape Town" } as Record<string, unknown>,
  units: [{ id: "u1", name: "Cottage" }] as Record<string, unknown>[],
  charges: [{ id: "c1", amount: 250 }] as Record<string, unknown>[],
  attractions: [{ id: "a1", name: "Beach", distance_km: 2 }] as Record<string, unknown>[],
});

Deno.test("the same snapshot hashes identically at every call site", async () => {
  const a = await staticSnapshotHash(snapshot());
  const b = await staticSnapshotHash(snapshot());
  assertEquals(a, b);
  assert(a.length > 0);
});

Deno.test("an attractions-only edit changes the static hash", async () => {
  const before = await staticSnapshotHash(snapshot());
  const after = await staticSnapshotHash({
    ...snapshot(),
    attractions: [{ id: "a1", name: "Beach", distance_km: 4 }],
  });
  assertNotEquals(before, after);
});

Deno.test("a charges-only edit changes the static hash", async () => {
  const before = await staticSnapshotHash(snapshot());
  const after = await staticSnapshotHash({ ...snapshot(), charges: [{ id: "c1", amount: 300 }] });
  assertNotEquals(before, after);
});
