/**
 * Changeover code translation between ROL'OS and the channel wire format.
 *
 * ROL'OS internal scale (UI, `amenities.changeover`, `amenities.changeover_rules`):
 *   0 = no arrival or departure, 1 = arrival only, 2 = departure only, 3 = both
 *
 * Channel wire scale (`<C>` in Push_PutAvbUnits_RQ / `Changeover` in the calendar), per the
 * channel's own availability spec:
 *   1 = check-in AND check-out allowed
 *   2 = check-in only
 *   3 = check-out only
 *   4 = neither check-in nor check-out
 *
 * History — read before "fixing" this again: an earlier probe concluded 4 meant "both allowed"
 * and every internal code 1/2/3 was published as 4. That probe was confounded: the reservation
 * refusals it measured came from `Units="0"` on the stay nights, not from the changeover code.
 * The collapse it introduced silently published EVERY night as unrestricted, which is why an
 * authored "no departure on Sunday" rule had no effect at the channel and a booking checking
 * out on a barred day was accepted. One-sided rules are now published as the channel's own
 * one-sided codes, and our local availability guard still enforces them for direct bookings.
 */

const TO_WIRE: Record<number, number> = { 0: 4, 1: 2, 2: 3, 3: 1 };
const FROM_WIRE: Record<number, number> = { 4: 0, 2: 1, 3: 2, 1: 3 };

/** Internal (0..3) → wire (1..4). Unknown/null falls back to "check-in and check-out". */
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
