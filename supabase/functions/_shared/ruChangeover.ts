/**
 * Changeover code translation between ROL'OS and the channel wire format.
 *
 * ROL'OS internal scale (UI, `amenities.changeover`, `amenities.changeover_rules`):
 *   0 = no arrival or departure, 1 = arrival only, 2 = departure only, 3 = both
 *
 * Channel wire scale (`<C>` in Push_PutAvbUnits_RQ / `Changeover` in the calendar):
 *   1 = arrival and departure, 2 = arrival only, 3 = departure only, 4 = neither
 *
 * Sending an internal code straight onto the wire is rejected with status 147
 * ("Changeover is invalid. Use number 1, 2, 3 or 4.") for `0`, and silently mis-published
 * for the rest (internal 3 "both" lands as wire 3 "departure only"). Always translate here.
 */

const TO_WIRE: Record<number, number> = { 0: 4, 1: 2, 2: 3, 3: 1 };
const FROM_WIRE: Record<number, number> = { 4: 0, 2: 1, 3: 2, 1: 3 };

/** Internal (0..3) → wire (1..4). Unknown/null falls back to "arrival and departure". */
export function toWireChangeover(internal: unknown): number {
  const n = Number(internal);
  return Number.isFinite(n) && TO_WIRE[n] != null ? TO_WIRE[n] : 1;
}

/** Wire (1..4) → internal (0..3). Returns null when the value is absent or unknown. */
export function fromWireChangeover(wire: unknown): number | null {
  if (wire == null || wire === '') return null;
  const n = Number(wire);
  return Number.isFinite(n) && FROM_WIRE[n] != null ? FROM_WIRE[n] : null;
}
